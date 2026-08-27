import { randomBytes } from "node:crypto";
import type postgres from "postgres";

export const TURN_QUEUE_INPUT_TYPES = [
  "normal",
  "pause_group_response",
  "component_interaction_response",
  "correction",
] as const;

export type TurnQueueInputType = (typeof TURN_QUEUE_INPUT_TYPES)[number];

/** Higher wins over lower when claiming. Keep in sync with @forgeroom/orchestration/turn-queue. */
export const TURN_QUEUE_PRIORITY: Record<TurnQueueInputType, number> = {
  pause_group_response: 100,
  component_interaction_response: 50,
  correction: 10,
  normal: 0,
};

export type SqlClient = postgres.Sql;

export type EnqueueTurnQueueItemInput = {
  id?: string;
  channelAgentSessionId: string;
  runStepId: string;
  inputType: TurnQueueInputType;
  /** Required for non-normal items; ignored for unbound queued normals. */
  boundSessionGenerationId?: string | null;
  inputPayloadRedacted?: Record<string, unknown>;
};

export type ClaimTurnQueueItemInput = {
  queueItemId: string;
  workerId: string;
  leaseExpiresAt: string;
  now?: string;
  expectedState?: "queued" | "retryable";
};

export type ClaimTurnQueueItemResult =
  | {
      ok: true;
      queueItemId: string;
      channelAgentSessionId: string;
      runStepId: string;
      inputType: TurnQueueInputType;
      boundSessionGenerationId: string;
      agentTurnId: string;
      applicationRunToken: string;
      aguiRunId: string;
      leaseOwner: string;
      leaseExpiresAt: string;
    }
  | {
      ok: false;
      reason:
        | "not_found"
        | "not_queued"
        | "not_next"
        | "session_rotating"
        | "session_disabled"
        | "session_busy"
        | "missing_generation"
        | "stale_generation"
        | "lease_conflict"
        | "lease_active";
    };

function opaqueId(prefix: string): string {
  return `${prefix}_${randomBytes(10).toString("hex")}`;
}

function priorityForInputType(inputType: TurnQueueInputType): number {
  return TURN_QUEUE_PRIORITY[inputType];
}

function evaluateClaimEligibility(input: {
  sessionState: "active" | "rotating" | "disabled";
  hasRemoteActiveTurn: boolean;
}): Extract<ClaimTurnQueueItemResult, { ok: false }> | { ok: true } {
  if (input.sessionState === "rotating") {
    return { ok: false, reason: "session_rotating" };
  }
  if (input.sessionState === "disabled") {
    return { ok: false, reason: "session_disabled" };
  }
  if (input.hasRemoteActiveTurn) {
    return { ok: false, reason: "session_busy" };
  }
  return { ok: true };
}

function resolveClaimGenerationBinding(input: {
  inputType: TurnQueueInputType;
  boundGenerationId: string | null;
  currentGenerationId: string | null;
}): { ok: true; boundGenerationId: string } | Extract<ClaimTurnQueueItemResult, { ok: false }> {
  if (!input.currentGenerationId) {
    return { ok: false, reason: "missing_generation" };
  }
  if (input.inputType === "normal") {
    return { ok: true, boundGenerationId: input.currentGenerationId };
  }
  if (!input.boundGenerationId) {
    return { ok: false, reason: "missing_generation" };
  }
  if (input.boundGenerationId !== input.currentGenerationId) {
    return { ok: false, reason: "stale_generation" };
  }
  return { ok: true, boundGenerationId: input.boundGenerationId };
}

export async function enqueueTurnQueueItem(
  sql: SqlClient,
  input: EnqueueTurnQueueItemInput,
): Promise<{ id: string; fifoSequence: number; priority: number }> {
  const id = input.id ?? opaqueId("tqi");
  const priority = priorityForInputType(input.inputType);
  if (input.inputType !== "normal" && !input.boundSessionGenerationId) {
    throw new Error(`${input.inputType} queue items require boundSessionGenerationId`);
  }

  return sql.begin(async (tx) => {
    // Session row lock serializes enqueue even when the queue is empty.
    const sessions = await tx<{ id: string }[]>`
      SELECT id
      FROM channel_agent_sessions
      WHERE id = ${input.channelAgentSessionId}
      FOR UPDATE
    `;
    if (!sessions[0]) {
      throw new Error(`channel_agent_session not found: ${input.channelAgentSessionId}`);
    }
    const locked = await tx<{ fifo_sequence: number }[]>`
      SELECT fifo_sequence
      FROM turn_queue_items
      WHERE channel_agent_session_id = ${input.channelAgentSessionId}
      ORDER BY fifo_sequence DESC
      LIMIT 1
      FOR UPDATE
    `;
    const fifoSequence = (locked[0]?.fifo_sequence ?? -1) + 1;
    const bound =
      input.inputType === "normal"
        ? (input.boundSessionGenerationId ?? null)
        : input.boundSessionGenerationId!;
    await tx`
      INSERT INTO turn_queue_items (
        id, channel_agent_session_id, run_step_id, bound_session_generation_id, input_type,
        input_payload_redacted_json, priority, fifo_sequence, state, created_at
      ) VALUES (
        ${id}, ${input.channelAgentSessionId}, ${input.runStepId}, ${bound}, ${input.inputType},
        ${JSON.stringify(input.inputPayloadRedacted ?? {})}::jsonb, ${priority}, ${fifoSequence},
        'queued', ${new Date().toISOString()}
      )
    `;
    return { id, fifoSequence, priority };
  });
}

export async function claimTurnQueueItem(
  sql: SqlClient,
  input: ClaimTurnQueueItemInput,
): Promise<ClaimTurnQueueItemResult> {
  const now = input.now ?? new Date().toISOString();
  const expectedState = input.expectedState ?? "queued";

  return sql.begin(async (tx) => {
    const items = await tx<
      {
        id: string;
        channel_agent_session_id: string;
        run_step_id: string;
        bound_session_generation_id: string | null;
        input_type: TurnQueueInputType;
        state: string;
        lease_expires_at: string | Date | null;
      }[]
    >`
      SELECT id, channel_agent_session_id, run_step_id, bound_session_generation_id,
             input_type, state, lease_expires_at
      FROM turn_queue_items
      WHERE id = ${input.queueItemId}
      FOR UPDATE
    `;
    const item = items[0];
    if (!item) {
      return { ok: false, reason: "not_found" };
    }

    if (item.state === "claimed" && expectedState === "retryable") {
      const expiresAt = item.lease_expires_at
        ? new Date(item.lease_expires_at).toISOString()
        : null;
      if (expiresAt && expiresAt > now) {
        return { ok: false, reason: "lease_active" };
      }
      const turns = await tx<{ id: string; state: string }[]>`
        SELECT id, state
        FROM agent_turns
        WHERE queue_item_id = ${item.id}
        ORDER BY started_at DESC NULLS LAST
        LIMIT 1
        FOR UPDATE
      `;
      const turn = turns[0];
      if (turn && turn.state !== "acquiring" && turn.state !== "intended") {
        return { ok: false, reason: "lease_conflict" };
      }
      if (turn) {
        await tx`
          UPDATE agent_turns
          SET state = 'cancelled', completed_at = ${now}
          WHERE id = ${turn.id}
        `;
      }
      await tx`
        UPDATE turn_queue_items
        SET
          state = 'queued',
          lease_owner = NULL,
          lease_expires_at = NULL,
          claimed_at = NULL
        WHERE id = ${item.id}
      `;
      item.state = "queued";
    } else if (item.state !== "queued") {
      return { ok: false, reason: "not_queued" };
    }

    const sessions = await tx<
      {
        id: string;
        state: "active" | "rotating" | "disabled";
        current_generation_id: string | null;
      }[]
    >`
      SELECT id, state, current_generation_id
      FROM channel_agent_sessions
      WHERE id = ${item.channel_agent_session_id}
      FOR UPDATE
    `;
    const session = sessions[0];
    if (!session) {
      return { ok: false, reason: "not_found" };
    }

    const next = await tx<{ id: string }[]>`
      SELECT id
      FROM turn_queue_items
      WHERE channel_agent_session_id = ${item.channel_agent_session_id}
        AND state = 'queued'
      ORDER BY priority DESC, fifo_sequence ASC
      LIMIT 1
      FOR UPDATE
    `;
    if (!next[0] || next[0].id !== item.id) {
      return { ok: false, reason: "not_next" };
    }

    const active = await tx<{ id: string }[]>`
      SELECT id
      FROM agent_turns
      WHERE channel_agent_session_id = ${item.channel_agent_session_id}
        AND state IN ('acquiring', 'creating', 'streaming', 'resuming')
      LIMIT 1
      FOR UPDATE
    `;
    const eligibility = evaluateClaimEligibility({
      sessionState: session.state,
      hasRemoteActiveTurn: active.length > 0,
    });
    if (!eligibility.ok) {
      return eligibility;
    }

    const cancelling = await tx<{ id: string }[]>`
      SELECT rs.id
      FROM run_steps AS rs
      JOIN agent_turns AS t ON t.run_step_id = rs.id
      WHERE t.channel_agent_session_id = ${item.channel_agent_session_id}
        AND rs.state = 'cancelling'
      LIMIT 1
    `;
    if (cancelling.length > 0) {
      return { ok: false, reason: "session_busy" };
    }

    const binding = resolveClaimGenerationBinding({
      inputType: item.input_type,
      boundGenerationId: item.bound_session_generation_id,
      currentGenerationId: session.current_generation_id,
    });
    if (!binding.ok) {
      return binding;
    }

    const agentTurnId = opaqueId("aturn");
    const applicationRunToken = opaqueId("art");
    const aguiRunId = opaqueId("agui");

    await tx`
      UPDATE turn_queue_items
      SET
        state = 'claimed',
        bound_session_generation_id = ${binding.boundGenerationId},
        lease_owner = ${input.workerId},
        lease_expires_at = ${input.leaseExpiresAt},
        claimed_at = ${now}
      WHERE id = ${item.id}
    `;

    await tx`
      INSERT INTO agent_turns (
        id, run_step_id, channel_agent_session_id, session_generation_id, queue_item_id,
        application_run_token, agui_run_id, input_type, state, started_at
      ) VALUES (
        ${agentTurnId}, ${item.run_step_id}, ${item.channel_agent_session_id},
        ${binding.boundGenerationId}, ${item.id}, ${applicationRunToken}, ${aguiRunId},
        ${item.input_type}, 'acquiring', ${now}
      )
    `;

    return {
      ok: true,
      queueItemId: item.id,
      channelAgentSessionId: item.channel_agent_session_id,
      runStepId: item.run_step_id,
      inputType: item.input_type,
      boundSessionGenerationId: binding.boundGenerationId,
      agentTurnId,
      applicationRunToken,
      aguiRunId,
      leaseOwner: input.workerId,
      leaseExpiresAt: input.leaseExpiresAt,
    };
  });
}

export async function heartbeatTurnQueueLease(
  sql: SqlClient,
  input: { queueItemId: string; workerId: string; leaseExpiresAt: string },
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "lease_mismatch" | "not_claimed" }> {
  const rows = await sql`
    UPDATE turn_queue_items
    SET lease_expires_at = ${input.leaseExpiresAt}
    WHERE id = ${input.queueItemId}
      AND state = 'claimed'
      AND lease_owner = ${input.workerId}
    RETURNING id
  `;
  if (rows.length === 0) {
    const existing = await sql<{ state: string; lease_owner: string | null }[]>`
      SELECT state, lease_owner FROM turn_queue_items WHERE id = ${input.queueItemId} LIMIT 1
    `;
    if (!existing[0]) {
      return { ok: false, reason: "not_found" };
    }
    if (existing[0].state !== "claimed") {
      return { ok: false, reason: "not_claimed" };
    }
    return { ok: false, reason: "lease_mismatch" };
  }
  return { ok: true };
}

/**
 * Reclaim an expired claim only when the AgentTurn never left `acquiring`.
 * Streaming/creating turns fail closed (no reclaim).
 */
export async function reclaimExpiredTurnQueueLease(
  sql: SqlClient,
  input: { queueItemId: string; now?: string },
): Promise<
  | { ok: true; reclaimed: true }
  | { ok: true; reclaimed: false; reason: "lease_active" | "not_claimed" }
  | { ok: false; reason: "not_found" | "fail_closed_remote_active" }
> {
  const now = input.now ?? new Date().toISOString();
  return sql.begin(async (tx) => {
    const items = await tx<
      {
        id: string;
        state: string;
        input_type: TurnQueueInputType;
        lease_expires_at: string | Date | null;
      }[]
    >`
      SELECT id, state, input_type, lease_expires_at
      FROM turn_queue_items
      WHERE id = ${input.queueItemId}
      FOR UPDATE
    `;
    const item = items[0];
    if (!item) {
      return { ok: false, reason: "not_found" };
    }
    if (item.state !== "claimed") {
      return { ok: true, reclaimed: false, reason: "not_claimed" };
    }
    const expiresAt = item.lease_expires_at ? new Date(item.lease_expires_at).toISOString() : null;
    if (expiresAt && expiresAt > now) {
      return { ok: true, reclaimed: false, reason: "lease_active" };
    }

    const turns = await tx<{ id: string; state: string }[]>`
      SELECT id, state
      FROM agent_turns
      WHERE queue_item_id = ${item.id}
      ORDER BY started_at DESC NULLS LAST
      LIMIT 1
      FOR UPDATE
    `;
    const turn = turns[0];
    if (turn && turn.state !== "acquiring" && turn.state !== "intended") {
      return { ok: false, reason: "fail_closed_remote_active" };
    }
    if (turn) {
      await tx`
        UPDATE agent_turns
        SET state = 'cancelled', completed_at = ${now}
        WHERE id = ${turn.id}
      `;
    }
    // Keep bound_session_generation_id: agent_turns_queue_binding_fk still references it
    // on the cancelled turn. Normals rebind to the live generation on the next claim.
    await tx`
      UPDATE turn_queue_items
      SET
        state = 'queued',
        lease_owner = NULL,
        lease_expires_at = NULL,
        claimed_at = NULL
      WHERE id = ${item.id}
    `;
    return { ok: true, reclaimed: true };
  });
}

export async function listClaimableQueueItems(
  sql: SqlClient,
  channelAgentSessionId: string,
): Promise<
  Array<{
    id: string;
    inputType: TurnQueueInputType;
    priority: number;
    fifoSequence: number;
  }>
> {
  const rows = await sql<
    {
      id: string;
      input_type: TurnQueueInputType;
      priority: number;
      fifo_sequence: number;
    }[]
  >`
    SELECT id, input_type, priority, fifo_sequence
    FROM turn_queue_items
    WHERE channel_agent_session_id = ${channelAgentSessionId}
      AND state = 'queued'
    ORDER BY priority DESC, fifo_sequence ASC
  `;
  return rows.map((row) => ({
    id: row.id,
    inputType: row.input_type,
    priority: row.priority,
    fifoSequence: row.fifo_sequence,
  }));
}
