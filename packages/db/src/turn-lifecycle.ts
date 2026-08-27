import { randomBytes } from "node:crypto";
import type postgres from "postgres";
import { applyRunLifecycleProjection } from "./multi-agent-run";

export type SqlClient = postgres.Sql;

export type NormalizedRunEventInput = {
  trueforgeEventId: string;
  normalizedType: string;
  threadId: string | null;
  sequenceNumber: number | null;
  payloadRedacted: Record<string, unknown>;
};

export type TurnDoneOutcomeInput =
  | {
      kind: "required_actions";
      agentTurnState: "required_actions";
      runStepState: "awaiting_approval" | "awaiting_input" | "blocked_connection";
      requiredActionCount: number;
    }
  | {
      kind: "terminal_success";
      agentTurnState: "completed";
      runStepState: "completed";
      requiredActionCount: 0;
    };

function opaqueId(prefix: string): string {
  return `${prefix}_${randomBytes(10).toString("hex")}`;
}

export async function lockAgentTurnForCreate(
  sql: SqlClient,
  input: { agentTurnId: string; expectedStates: string[] },
): Promise<
  | {
      ok: true;
      applicationRunToken: string;
      localTrueforgeTurnId: string | null;
      previousTrueforgeTurnId: string | null;
      state: string;
    }
  | { ok: false; reason: "not_found" | "state_mismatch" }
> {
  return sql.begin(async (tx) => {
    const rows = await tx<
      {
        id: string;
        state: string;
        application_run_token: string;
        trueforge_turn_id: string | null;
        previous_trueforge_turn_id: string | null;
      }[]
    >`
      SELECT id, state, application_run_token, trueforge_turn_id, previous_trueforge_turn_id
      FROM agent_turns
      WHERE id = ${input.agentTurnId}
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) {
      return { ok: false, reason: "not_found" };
    }
    if (!input.expectedStates.includes(row.state)) {
      return { ok: false, reason: "state_mismatch" };
    }
    if (row.state === "acquiring" || row.state === "intended") {
      await tx`
        UPDATE agent_turns SET state = 'creating' WHERE id = ${input.agentTurnId}
      `;
    }
    return {
      ok: true,
      applicationRunToken: row.application_run_token,
      localTrueforgeTurnId: row.trueforge_turn_id,
      previousTrueforgeTurnId: row.previous_trueforge_turn_id,
      state: row.state === "acquiring" || row.state === "intended" ? "creating" : row.state,
    };
  });
}

export async function bindTrueForgeTurnId(
  sql: SqlClient,
  input: {
    agentTurnId: string;
    trueforgeTurnId: string;
    previousTrueforgeTurnId: string | null;
    expectedStates: string[];
    nextState?: "creating" | "streaming";
    now?: string;
  },
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "state_mismatch" }> {
  const now = input.now ?? new Date().toISOString();
  const nextState = input.nextState ?? "streaming";
  const rows = await sql`
    UPDATE agent_turns
    SET
      trueforge_turn_id = ${input.trueforgeTurnId},
      previous_trueforge_turn_id = ${input.previousTrueforgeTurnId},
      state = ${nextState},
      started_at = COALESCE(started_at, ${now})
    WHERE id = ${input.agentTurnId}
      AND state IN ${sql(input.expectedStates)}
    RETURNING id
  `;
  if (rows.length === 0) {
    const existing = await sql<{ state: string }[]>`
      SELECT state FROM agent_turns WHERE id = ${input.agentTurnId} LIMIT 1
    `;
    if (!existing[0]) {
      return { ok: false, reason: "not_found" };
    }
    return { ok: false, reason: "state_mismatch" };
  }
  return { ok: true };
}

export async function markAgentTurnUncertain(
  sql: SqlClient,
  input: {
    agentTurnId: string;
    error?: Record<string, unknown>;
    expectedStates?: string[];
  },
): Promise<{ ok: true } | { ok: false; reason: "state_mismatch" }> {
  const expected = input.expectedStates ?? ["intended", "acquiring", "creating", "uncertain"];
  const rows = await sql`
    UPDATE agent_turns
    SET
      state = 'uncertain',
      error_json = ${JSON.stringify(input.error ?? { reason: "create_uncertain" })}::jsonb
    WHERE id = ${input.agentTurnId}
      AND state IN ${sql(expected)}
    RETURNING id
  `;
  if (rows.length === 0) {
    return { ok: false, reason: "state_mismatch" };
  }
  return { ok: true };
}

export type IngestRunEventResult =
  | {
      ok: true;
      inserted: boolean;
      runEventId: string;
      normalizedType: string;
      turnOutcome: TurnDoneOutcomeInput | null;
    }
  | { ok: false; reason: "not_found" | "state_mismatch" };

export async function ingestNormalizedTrueForgeEvent(
  sql: SqlClient,
  input: {
    agentTurnId: string;
    expectedTurnStates: string[];
    event: NormalizedRunEventInput;
    turnDoneOutcome?: TurnDoneOutcomeInput | null;
    now?: string;
  },
): Promise<IngestRunEventResult> {
  const now = input.now ?? new Date().toISOString();
  const normalized = input.event;

  return sql.begin(async (tx) => {
    const turns = await tx<
      {
        id: string;
        state: string;
        last_trueforge_sequence: number;
        run_step_id: string;
      }[]
    >`
      SELECT id, state, last_trueforge_sequence, run_step_id
      FROM agent_turns
      WHERE id = ${input.agentTurnId}
      FOR UPDATE
    `;
    const turn = turns[0];
    if (!turn) {
      return { ok: false, reason: "not_found" };
    }
    if (!input.expectedTurnStates.includes(turn.state)) {
      return { ok: false, reason: "state_mismatch" };
    }

    const existing = await tx<{ id: string }[]>`
      SELECT id
      FROM run_events
      WHERE agent_turn_id = ${input.agentTurnId}
        AND trueforge_event_id = ${normalized.trueforgeEventId}
      FOR UPDATE
    `;

    let runEventId: string;
    let inserted = false;
    if (existing[0]) {
      runEventId = existing[0].id;
      await tx`
        UPDATE run_events
        SET
          normalized_payload_redacted_json = ${JSON.stringify(normalized.payloadRedacted)}::jsonb,
          normalized_type = ${normalized.normalizedType},
          thread_id = ${normalized.threadId},
          updated_at = ${now}
        WHERE id = ${runEventId}
      `;
    } else {
      runEventId = opaqueId("re");
      inserted = true;
      await tx`
        INSERT INTO run_events (
          id, agent_turn_id, trueforge_event_id, thread_id,
          normalized_payload_redacted_json, normalized_type, first_seen_at, updated_at
        ) VALUES (
          ${runEventId}, ${input.agentTurnId}, ${normalized.trueforgeEventId}, ${normalized.threadId},
          ${JSON.stringify(normalized.payloadRedacted)}::jsonb, ${normalized.normalizedType},
          ${now}, ${now}
        )
      `;
    }

    if (
      normalized.sequenceNumber !== null &&
      normalized.sequenceNumber > turn.last_trueforge_sequence
    ) {
      await tx`
        UPDATE agent_turns
        SET last_trueforge_sequence = ${normalized.sequenceNumber}
        WHERE id = ${input.agentTurnId}
      `;
    }

    const turnOutcome = input.turnDoneOutcome ?? null;
    const terminalError =
      normalized.normalizedType === "turn.error" ||
      normalized.normalizedType === "turn.failed" ||
      normalized.normalizedType === "session.error";
    if (normalized.normalizedType === "turn.done" && turnOutcome && inserted) {
      await tx`
        UPDATE agent_turns
        SET
          state = ${turnOutcome.agentTurnState},
          completed_at = ${now}
        WHERE id = ${input.agentTurnId}
      `;
      if (turnOutcome.kind === "terminal_success") {
        await tx`
          UPDATE run_steps
          SET state = ${turnOutcome.runStepState}, completed_at = ${now}
          WHERE id = ${turn.run_step_id}
        `;
      } else {
        await tx`
          UPDATE run_steps
          SET state = ${turnOutcome.runStepState}, completed_at = NULL
          WHERE id = ${turn.run_step_id}
        `;
      }
      await tx`
        UPDATE turn_queue_items
        SET state = 'completed', completed_at = ${now}, lease_owner = NULL, lease_expires_at = NULL
        WHERE id = (
          SELECT queue_item_id FROM agent_turns WHERE id = ${input.agentTurnId}
        )
      `;
    } else if (terminalError && inserted) {
      await tx`
        UPDATE agent_turns
        SET
          state = 'failed',
          error_json = '{"reason":"trueforge_terminal_error"}'::jsonb,
          completed_at = ${now}
        WHERE id = ${input.agentTurnId}
      `;
      await tx`
        UPDATE run_steps
        SET state = 'failed', completed_at = ${now}
        WHERE id = ${turn.run_step_id}
      `;
      await tx`
        UPDATE turn_queue_items
        SET state = 'failed', completed_at = ${now}, lease_owner = NULL, lease_expires_at = NULL
        WHERE id = (
          SELECT queue_item_id FROM agent_turns WHERE id = ${input.agentTurnId}
        )
      `;
    } else if (inserted && turn.state === "creating") {
      await tx`
        UPDATE agent_turns SET state = 'streaming' WHERE id = ${input.agentTurnId}
      `;
      await tx`
        UPDATE run_steps
        SET state = 'running', started_at = COALESCE(started_at, ${now})
        WHERE id = ${turn.run_step_id}
          AND state IN ('queued', 'acquiring_session', 'running')
      `;
    }

    const runRows = await tx<{ run_id: string }[]>`
      SELECT run_id FROM run_steps WHERE id = ${turn.run_step_id} LIMIT 1
    `;
    if (runRows[0] && (turnOutcome || terminalError || (inserted && turn.state === "creating"))) {
      await applyRunLifecycleProjection(tx as unknown as SqlClient, {
        runId: runRows[0].run_id,
        now,
      });
    }

    return {
      ok: true,
      inserted,
      runEventId,
      normalizedType: normalized.normalizedType,
      turnOutcome: inserted ? turnOutcome : null,
    };
  });
}
