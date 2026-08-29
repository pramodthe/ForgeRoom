import type { Run, RunStepState } from "@forgeroom/contracts";
import type postgres from "postgres";
import { aggregateRunFromStepsLocal } from "./multi-agent-run";

type SqlClient = postgres.Sql;

export type RunDetailRecord = {
  workspaceId: string;
  run: Run;
  sourceMessageBody: string;
};

export async function loadRunDetail(
  sql: SqlClient,
  runId: string,
): Promise<RunDetailRecord | null> {
  const runs = await sql<
    {
      id: string;
      channel_id: string;
      workspace_id: string;
      source_message_id: string;
      requested_by: string;
      routing_mode: "direct" | "team";
      goal: string;
      started_at: string | Date | null;
      completed_at: string | Date | null;
    }[]
  >`
    SELECT
      r.id,
      r.channel_id,
      c.workspace_id,
      r.source_message_id,
      r.requested_by,
      r.routing_mode,
      r.goal,
      r.started_at,
      r.completed_at
    FROM runs AS r
    JOIN channels AS c ON c.id = r.channel_id
    WHERE r.id = ${runId}
    LIMIT 1
  `;
  const run = runs[0];
  if (!run) {
    return null;
  }

  const steps = await sql<
    {
      id: string;
      run_id: string;
      assigned_agent_id: string;
      objective: string;
      state: RunStepState;
      attempt: number;
      logical_thread_id: string | null;
    }[]
  >`
    SELECT
      rs.id,
      rs.run_id,
      rs.assigned_agent_id,
      rs.objective,
      rs.state,
      rs.attempt,
      (
        SELECT cas.logical_agui_thread_id
        FROM turn_queue_items AS tqi
        JOIN channel_agent_sessions AS cas ON cas.id = tqi.channel_agent_session_id
        WHERE tqi.run_step_id = rs.id
        ORDER BY tqi.fifo_sequence
        LIMIT 1
      ) AS logical_thread_id
    FROM run_steps AS rs
    WHERE rs.run_id = ${runId}
    ORDER BY rs.id
  `;

  const messages = await sql<{ body: string }[]>`
    SELECT body FROM messages WHERE id = ${run.source_message_id} LIMIT 1
  `;

  const projection = aggregateRunFromStepsLocal(steps.map((step) => ({ state: step.state })));
  const toIso = (value: string | Date | null): string | null =>
    value === null ? null : value instanceof Date ? value.toISOString() : value;

  return {
    workspaceId: run.workspace_id,
    sourceMessageBody: messages[0]?.body ?? "",
    run: {
      schemaVersion: 1,
      id: run.id,
      channel_id: run.channel_id,
      source_message_id: run.source_message_id,
      requested_by: run.requested_by,
      routing_mode: run.routing_mode,
      goal: run.goal,
      lifecycle: projection.lifecycle,
      activity: projection.activity,
      started_at: toIso(run.started_at),
      completed_at: toIso(run.completed_at),
      steps: steps.map((step) => ({
        schemaVersion: 1,
        id: step.id,
        run_id: step.run_id,
        assigned_coworker_id: step.assigned_agent_id,
        logical_thread_id: step.logical_thread_id ?? step.id,
        objective: step.objective,
        state: step.state,
        attempt: step.attempt,
      })),
    },
  };
}
