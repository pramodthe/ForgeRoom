import { randomBytes } from "node:crypto";
import type postgres from "postgres";
import { enqueueTurnQueueItem, TURN_QUEUE_PRIORITY } from "./turn-queue";

export type SqlClient = postgres.Sql;

export type StoppableStepState =
  | "queued"
  | "acquiring_session"
  | "running"
  | "awaiting_input"
  | "awaiting_approval"
  | "blocked_connection"
  | "cancelling"
  | "cancelled"
  | "completed"
  | "failed"
  | "unknown";

function opaqueId(prefix: string): string {
  return `${prefix}_${randomBytes(10).toString("hex")}`;
}

function decideStopLocal(stepState: StoppableStepState): {
  action: "enter_cancelling" | "already_cancelling" | "already_settled" | "not_stoppable";
  callCancel: boolean;
} {
  if (stepState === "cancelling") {
    return { action: "already_cancelling", callCancel: false };
  }
  if (stepState === "cancelled" || stepState === "completed" || stepState === "failed") {
    return { action: "already_settled", callCancel: false };
  }
  if (
    stepState === "running" ||
    stepState === "awaiting_input" ||
    stepState === "awaiting_approval" ||
    stepState === "blocked_connection" ||
    stepState === "acquiring_session" ||
    stepState === "queued"
  ) {
    return { action: "enter_cancelling", callCancel: true };
  }
  return { action: "not_stoppable", callCancel: false };
}

export type RequestStopResult =
  | {
      ok: true;
      decision: ReturnType<typeof decideStopLocal>;
      runStepId: string;
      agentTurnId: string | null;
      channelAgentSessionId: string | null;
      trueforgeSessionId: string | null;
      trueforgeTurnId: string | null;
    }
  | { ok: false; reason: "not_found" | "run_not_stoppable" };

export async function requestRunStepStop(
  sql: SqlClient,
  input: { runStepId: string; now?: string },
): Promise<RequestStopResult> {
  const now = input.now ?? new Date().toISOString();
  return sql.begin(async (tx) => {
    const steps = await tx<{ id: string; state: StoppableStepState; run_id: string }[]>`
      SELECT id, state, run_id FROM run_steps WHERE id = ${input.runStepId} FOR UPDATE
    `;
    const step = steps[0];
    if (!step) {
      return { ok: false, reason: "not_found" };
    }
    const decision = decideStopLocal(step.state);
    if (decision.action === "not_stoppable") {
      return { ok: false, reason: "run_not_stoppable" };
    }

    if (decision.action === "enter_cancelling") {
      await tx`
        UPDATE run_steps SET state = 'cancelling' WHERE id = ${step.id}
      `;
    }

    const turns = await tx<
      {
        id: string;
        channel_agent_session_id: string;
        trueforge_turn_id: string | null;
      }[]
    >`
      SELECT id, channel_agent_session_id, trueforge_turn_id
      FROM agent_turns
      WHERE run_step_id = ${step.id}
        AND state IN ('acquiring', 'creating', 'streaming', 'resuming', 'required_actions')
      ORDER BY started_at DESC NULLS LAST
      LIMIT 1
      FOR UPDATE
    `;
    const turn = turns[0] ?? null;
    let trueforgeSessionId: string | null = null;
    if (turn) {
      const gens = await tx<{ trueforge_session_id: string }[]>`
        SELECT g.trueforge_session_id
        FROM agent_turns AS t
        JOIN channel_agent_session_generations AS g
          ON g.id = t.session_generation_id
        WHERE t.id = ${turn.id}
        LIMIT 1
      `;
      trueforgeSessionId = gens[0]?.trueforge_session_id ?? null;
      await tx`
        UPDATE agent_turns
        SET error_json = COALESCE(error_json, '{}'::jsonb) || ${JSON.stringify({
          cancel_requested_at: now,
          cancel_call_pending: decision.callCancel,
        })}::jsonb
        WHERE id = ${turn.id}
      `;
    }

    return {
      ok: true,
      decision,
      runStepId: step.id,
      agentTurnId: turn?.id ?? null,
      channelAgentSessionId: turn?.channel_agent_session_id ?? null,
      trueforgeSessionId,
      trueforgeTurnId: turn?.trueforge_turn_id ?? null,
    };
  });
}

export async function markCancelCalled(
  sql: SqlClient,
  input: { agentTurnId: string; now?: string },
): Promise<void> {
  const now = input.now ?? new Date().toISOString();
  await sql`
    UPDATE agent_turns
    SET error_json = COALESCE(error_json, '{}'::jsonb) || ${JSON.stringify({
      cancel_called_at: now,
      cancel_call_pending: false,
    })}::jsonb
    WHERE id = ${input.agentTurnId}
  `;
}

export async function settleCancelledStep(
  sql: SqlClient,
  input: { runStepId: string; now?: string },
): Promise<void> {
  const now = input.now ?? new Date().toISOString();
  await sql.begin(async (tx) => {
    await tx`
      UPDATE run_steps
      SET state = 'cancelled', completed_at = ${now}
      WHERE id = ${input.runStepId} AND state = 'cancelling'
    `;
    await tx`
      UPDATE agent_turns
      SET state = 'cancelled', completed_at = ${now}
      WHERE run_step_id = ${input.runStepId}
        AND state IN ('acquiring', 'creating', 'streaming', 'resuming', 'uncertain')
    `;
  });
}

export async function sessionHasCancellingStep(
  sql: SqlClient,
  channelAgentSessionId: string,
): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    SELECT rs.id
    FROM run_steps AS rs
    JOIN agent_turns AS t ON t.run_step_id = rs.id
    WHERE t.channel_agent_session_id = ${channelAgentSessionId}
      AND rs.state = 'cancelling'
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function enqueueCorrectionForStep(
  sql: SqlClient,
  input: {
    channelAgentSessionId: string;
    priorRunStepId: string;
    content: string;
    boundSessionGenerationId?: string | null;
  },
): Promise<{ queueItemId: string; runStepId: string }> {
  if (!input.priorRunStepId.trim() || !input.content.trim()) {
    throw new Error("correction requires priorRunStepId and content");
  }
  const prior = await sql<{ run_id: string; assigned_agent_id: string }[]>`
    SELECT run_id, assigned_agent_id FROM run_steps WHERE id = ${input.priorRunStepId} LIMIT 1
  `;
  if (!prior[0]) {
    throw new Error(`prior run step not found: ${input.priorRunStepId}`);
  }
  const runStepId = opaqueId("step");
  await sql`
    INSERT INTO run_steps (
      id, run_id, assigned_agent_id, objective, context_refs_json, state, attempt
    ) VALUES (
      ${runStepId}, ${prior[0].run_id}, ${prior[0].assigned_agent_id},
      ${`Correction: ${input.content.trim()}`},
      ${JSON.stringify([{ prior_run_step_id: input.priorRunStepId }])}::jsonb,
      'queued', 1
    )
  `;
  const queued = await enqueueTurnQueueItem(sql, {
    channelAgentSessionId: input.channelAgentSessionId,
    runStepId,
    inputType: "correction",
    boundSessionGenerationId: input.boundSessionGenerationId ?? null,
    inputPayloadRedacted: {
      content: input.content.trim(),
      prior_run_step_id: input.priorRunStepId,
      priority: TURN_QUEUE_PRIORITY.correction,
    },
  });
  return { queueItemId: queued.id, runStepId };
}

export async function markActiveTurnsNeedsAttentionOnRestart(
  sql: SqlClient,
  input: { now?: string } = {},
): Promise<{ marked: number }> {
  const now = input.now ?? new Date().toISOString();
  const rows = await sql`
    UPDATE agent_turns
    SET
      state = 'uncertain',
      error_json = ${JSON.stringify({
        needs_attention: true,
        reason: "process_restart",
        auto_retry: false,
        marked_at: now,
      })}::jsonb
    WHERE state IN ('acquiring', 'creating', 'streaming', 'resuming')
    RETURNING id
  `;
  return { marked: rows.length };
}
