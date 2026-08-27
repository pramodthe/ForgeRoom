import { randomBytes } from "node:crypto";
import type postgres from "postgres";
import { TURN_QUEUE_PRIORITY } from "./turn-queue";

export type SqlClient = postgres.Sql;

export type RunLifecycle = "queued" | "active" | "completed" | "partial" | "failed" | "cancelled";

export type RunStepState =
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

export type RunActivityCounters = {
  planning: number;
  running: number;
  awaiting_input: number;
  awaiting_approval: number;
  blocked_connection: number;
  cancelling: number;
  queued: number;
};

export type CreateDirectMultiAgentRunStepInput = {
  id?: string;
  assignedAgentId: string;
  channelAgentSessionId: string;
  logicalThreadId: string;
  objective: string;
  queueItemId?: string;
};

export type CreateDirectMultiAgentRunInput = {
  id?: string;
  channelId: string;
  sourceMessageId: string;
  requestedBy: string;
  routingMode: "direct" | "team";
  goal: string;
  steps: CreateDirectMultiAgentRunStepInput[];
  now?: string;
};

export type CreateDirectMultiAgentRunResult = {
  runId: string;
  lifecycle: RunLifecycle;
  steps: Array<{
    id: string;
    assignedAgentId: string;
    channelAgentSessionId: string;
    logicalThreadId: string;
    queueItemId: string;
    fifoSequence: number;
  }>;
};

function opaqueId(prefix: string): string {
  return `${prefix}_${randomBytes(10).toString("hex")}`;
}

/** Keep in sync with @forgeroom/orchestration aggregateRunFromSteps. */
export function aggregateRunFromStepsLocal(steps: ReadonlyArray<{ state: RunStepState }>): {
  lifecycle: RunLifecycle;
  activity: RunActivityCounters;
} {
  const activity: RunActivityCounters = {
    planning: 0,
    running: 0,
    awaiting_input: 0,
    awaiting_approval: 0,
    blocked_connection: 0,
    cancelling: 0,
    queued: 0,
  };
  if (steps.length === 0) {
    return { lifecycle: "queued", activity };
  }

  let terminalCompleted = 0;
  let terminalFailed = 0;
  let terminalCancelled = 0;
  let terminalUnknown = 0;
  let nonTerminal = 0;
  let allStepsQueued = true;

  for (const step of steps) {
    if (step.state !== "queued") {
      allStepsQueued = false;
    }
    switch (step.state) {
      case "queued":
        activity.queued += 1;
        nonTerminal += 1;
        break;
      case "acquiring_session":
        activity.planning += 1;
        nonTerminal += 1;
        break;
      case "running":
        activity.running += 1;
        nonTerminal += 1;
        break;
      case "awaiting_input":
        activity.awaiting_input += 1;
        nonTerminal += 1;
        break;
      case "awaiting_approval":
        activity.awaiting_approval += 1;
        nonTerminal += 1;
        break;
      case "blocked_connection":
        activity.blocked_connection += 1;
        nonTerminal += 1;
        break;
      case "cancelling":
        activity.cancelling += 1;
        nonTerminal += 1;
        break;
      case "completed":
        terminalCompleted += 1;
        break;
      case "failed":
        terminalFailed += 1;
        break;
      case "cancelled":
        terminalCancelled += 1;
        break;
      case "unknown":
        terminalUnknown += 1;
        break;
    }
  }

  if (nonTerminal > 0) {
    return { lifecycle: allStepsQueued ? "queued" : "active", activity };
  }
  const terminalCount = terminalCompleted + terminalFailed + terminalCancelled + terminalUnknown;
  if (terminalUnknown > 0) return { lifecycle: "partial", activity };
  if (terminalCompleted === terminalCount) return { lifecycle: "completed", activity };
  if (terminalFailed === terminalCount) return { lifecycle: "failed", activity };
  if (terminalCancelled === terminalCount) return { lifecycle: "cancelled", activity };
  return { lifecycle: "partial", activity };
}

/**
 * Atomically persist a direct multi-agent Run, its RunSteps, and per-session queue items.
 * Requires the source message row to already exist (same or prior transaction).
 */
export async function createDirectMultiAgentRun(
  sql: SqlClient,
  input: CreateDirectMultiAgentRunInput,
): Promise<CreateDirectMultiAgentRunResult> {
  if (input.steps.length === 0) {
    throw new Error("direct multi-agent run requires at least one step");
  }
  const now = input.now ?? new Date().toISOString();
  const runId = input.id ?? opaqueId("run");

  return sql.begin(async (tx) => {
    const messages = await tx<{ id: string; channel_id: string }[]>`
      SELECT id, channel_id FROM messages WHERE id = ${input.sourceMessageId} FOR SHARE
    `;
    if (!messages[0] || messages[0].channel_id !== input.channelId) {
      throw new Error("source_message_id must reference a message in the same channel");
    }

    await tx`
      INSERT INTO runs (
        id, channel_id, source_message_id, requested_by, routing_mode, goal, lifecycle,
        scheduling_paused, budget_json, started_at, completed_at
      ) VALUES (
        ${runId}, ${input.channelId}, ${input.sourceMessageId}, ${input.requestedBy},
        ${input.routingMode}, ${input.goal}, 'queued', false, '{}'::jsonb, NULL, NULL
      )
    `;

    // Lock sessions in stable ID order to avoid deadlocks across concurrent fan-outs.
    const sessionIds = [...new Set(input.steps.map((step) => step.channelAgentSessionId))].sort();
    const sessionById = new Map<
      string,
      { id: string; agent_profile_id: string; channel_id: string }
    >();
    for (const sessionId of sessionIds) {
      const sessions = await tx<{ id: string; agent_profile_id: string; channel_id: string }[]>`
        SELECT id, agent_profile_id, channel_id
        FROM channel_agent_sessions
        WHERE id = ${sessionId}
        FOR UPDATE
      `;
      if (!sessions[0]) {
        throw new Error(`channel_agent_session not found: ${sessionId}`);
      }
      if (sessions[0].channel_id !== input.channelId) {
        throw new Error(`channel_agent_session ${sessionId} is not in channel ${input.channelId}`);
      }
      sessionById.set(sessionId, sessions[0]);
    }

    const created: CreateDirectMultiAgentRunResult["steps"] = [];

    for (const step of input.steps) {
      const stepId = step.id ?? opaqueId("step");
      const queueItemId = step.queueItemId ?? opaqueId("tqi");
      const session = sessionById.get(step.channelAgentSessionId);
      if (!session) {
        throw new Error(`channel_agent_session not found: ${step.channelAgentSessionId}`);
      }
      if (session.agent_profile_id !== step.assignedAgentId) {
        throw new Error(
          `assignedAgentId ${step.assignedAgentId} does not own session ${step.channelAgentSessionId}`,
        );
      }

      const locked = await tx<{ fifo_sequence: number }[]>`
        SELECT fifo_sequence
        FROM turn_queue_items
        WHERE channel_agent_session_id = ${step.channelAgentSessionId}
        ORDER BY fifo_sequence DESC
        LIMIT 1
        FOR UPDATE
      `;
      const fifoSequence = (locked[0]?.fifo_sequence ?? -1) + 1;

      await tx`
        INSERT INTO run_steps (
          id, run_id, assigned_agent_id, objective, context_refs_json, state, attempt
        ) VALUES (
          ${stepId}, ${runId}, ${step.assignedAgentId}, ${step.objective},
          ${JSON.stringify([
            {
              source_message_id: input.sourceMessageId,
              logical_thread_id: step.logicalThreadId,
              channel_agent_session_id: step.channelAgentSessionId,
              emit_human_transcript: false,
            },
          ])}::jsonb,
          'queued', 1
        )
      `;

      await tx`
        INSERT INTO turn_queue_items (
          id, channel_agent_session_id, run_step_id, bound_session_generation_id, input_type,
          input_payload_redacted_json, priority, fifo_sequence, state, created_at
        ) VALUES (
          ${queueItemId}, ${step.channelAgentSessionId}, ${stepId}, NULL, 'normal',
          ${JSON.stringify({
            source_message_id: input.sourceMessageId,
            application_run_id: runId,
            run_step_id: stepId,
            logical_thread_id: step.logicalThreadId,
            emit_human_transcript: false,
          })}::jsonb,
          ${TURN_QUEUE_PRIORITY.normal}, ${fifoSequence}, 'queued', ${now}
        )
      `;

      created.push({
        id: stepId,
        assignedAgentId: step.assignedAgentId,
        channelAgentSessionId: step.channelAgentSessionId,
        logicalThreadId: step.logicalThreadId,
        queueItemId,
        fifoSequence,
      });
    }

    return { runId, lifecycle: "queued" as const, steps: created };
  });
}

export async function applyRunLifecycleProjection(
  tx: SqlClient,
  input: { runId: string; now: string },
): Promise<{ lifecycle: RunLifecycle; activity: RunActivityCounters }> {
  const steps = await tx<{ state: RunStepState }[]>`
    SELECT state FROM run_steps WHERE run_id = ${input.runId} FOR UPDATE
  `;
  const projection = aggregateRunFromStepsLocal(steps);
  const runRows = await tx<
    { started_at: string | Date | null; completed_at: string | Date | null }[]
  >`
    SELECT started_at, completed_at FROM runs WHERE id = ${input.runId} FOR UPDATE
  `;
  if (!runRows[0]) {
    throw new Error(`run not found: ${input.runId}`);
  }
  const startedAt = runRows[0].started_at ?? null;
  const completedAt = runRows[0].completed_at ?? null;
  const terminal =
    projection.lifecycle === "completed" ||
    projection.lifecycle === "partial" ||
    projection.lifecycle === "failed" ||
    projection.lifecycle === "cancelled";
  await tx`
    UPDATE runs
    SET
      lifecycle = ${projection.lifecycle},
      started_at = ${
        projection.lifecycle === "queued"
          ? null
          : startedAt
            ? new Date(startedAt).toISOString()
            : input.now
      },
      completed_at = ${
        terminal ? (completedAt ? new Date(completedAt).toISOString() : input.now) : null
      }
    WHERE id = ${input.runId}
  `;
  return projection;
}

export async function refreshRunLifecycle(
  sql: SqlClient,
  input: { runId: string; now?: string },
): Promise<{ lifecycle: RunLifecycle; activity: RunActivityCounters }> {
  const now = input.now ?? new Date().toISOString();
  return sql.begin(async (tx) =>
    applyRunLifecycleProjection(tx as unknown as SqlClient, { runId: input.runId, now }),
  );
}

export async function refreshRunLifecycleForStep(
  sql: SqlClient,
  input: { runStepId: string; now?: string },
): Promise<{ lifecycle: RunLifecycle; activity: RunActivityCounters; runId: string } | null> {
  const now = input.now ?? new Date().toISOString();
  return sql.begin(async (tx) => {
    const steps = await tx<{ run_id: string }[]>`
      SELECT run_id FROM run_steps WHERE id = ${input.runStepId} LIMIT 1
    `;
    const runId = steps[0]?.run_id;
    if (!runId) return null;
    const projection = await applyRunLifecycleProjection(tx as unknown as SqlClient, {
      runId,
      now,
    });
    return { ...projection, runId };
  });
}

export async function loadRunProjection(
  sql: SqlClient,
  runId: string,
): Promise<{
  runId: string;
  lifecycle: RunLifecycle;
  activity: RunActivityCounters;
  sourceMessageId: string;
  steps: Array<{ id: string; state: RunStepState; assignedAgentId: string }>;
} | null> {
  const runs = await sql<{ id: string; lifecycle: RunLifecycle; source_message_id: string }[]>`
    SELECT id, lifecycle, source_message_id FROM runs WHERE id = ${runId} LIMIT 1
  `;
  const run = runs[0];
  if (!run) return null;
  const steps = await sql<{ id: string; state: RunStepState; assigned_agent_id: string }[]>`
    SELECT id, state, assigned_agent_id FROM run_steps WHERE run_id = ${runId} ORDER BY id
  `;
  const projection = aggregateRunFromStepsLocal(steps);
  return {
    runId: run.id,
    lifecycle: projection.lifecycle,
    activity: projection.activity,
    sourceMessageId: run.source_message_id,
    steps: steps.map((step) => ({
      id: step.id,
      state: step.state,
      assignedAgentId: step.assigned_agent_id,
    })),
  };
}
