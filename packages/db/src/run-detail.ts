import type { Run, RunStepState, SafeJsonValue } from "@forgeroom/contracts";
import {
  formatQuestionPromptLabel,
  formatRunEventDetail,
  formatRunEventTitle,
} from "@forgeroom/domain";
import type postgres from "postgres";
import { aggregateRunFromStepsLocal } from "./multi-agent-run";

type SqlClient = postgres.Sql;

const WAITING_EVENT_TYPES = new Set([
  "approval.requested",
  "question.requested",
  "connection.required",
]);

export type RunDetailRecord = {
  workspaceId: string;
  run: Run;
  sourceMessageBody: string;
  events: Array<{
    id: string;
    normalizedType: string;
    title: string;
    detail: string;
    occurredAt: string;
    waiting: boolean;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    currentRevision: number;
  }>;
  artifacts: Array<{
    id: string;
    name: string;
    mimeType: string;
    revision: number;
    byteSize: number;
  }>;
  decisions: Array<{
    kind: "approval" | "question";
    id: string;
    state: string;
    label: string;
    waiting: boolean;
  }>;
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

  const eventRows = await sql<
    {
      id: string;
      normalized_type: string;
      normalized_payload_redacted_json: unknown;
      first_seen_at: string | Date;
    }[]
  >`
    SELECT re.id, re.normalized_type, re.normalized_payload_redacted_json, re.first_seen_at
    FROM run_events AS re
    JOIN agent_turns AS at ON at.id = re.agent_turn_id
    JOIN run_steps AS rs ON rs.id = at.run_step_id
    WHERE rs.run_id = ${runId}
    ORDER BY re.first_seen_at ASC, re.id ASC
  `;

  const taskRows = await sql<
    {
      id: string;
      title: string;
      status: string;
      current_revision: number;
    }[]
  >`
    SELECT id, title, status, current_revision
    FROM tasks
    WHERE source_run_id = ${runId}
    ORDER BY created_at ASC
  `;

  const artifactRows = await sql<
    {
      id: string;
      name: string;
      mime_type: string;
      revision: number;
      byte_size: number;
    }[]
  >`
    SELECT id, name, mime_type, revision, byte_size
    FROM artifacts
    WHERE run_id = ${runId}
    ORDER BY created_at ASC
  `;

  const approvalRows = await sql<{ id: string; state: string; tool_name: string }[]>`
    SELECT id, state, tool_name
    FROM action_proposals
    WHERE run_id = ${runId}
    ORDER BY id ASC
  `;

  const questionRows = await sql<{ id: string; state: string; prompt_redacted_json: unknown }[]>`
    SELECT id, state, prompt_redacted_json
    FROM questions
    WHERE run_id = ${runId}
    ORDER BY id ASC
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
    events: eventRows.map((row) => {
      const payload = row.normalized_payload_redacted_json as SafeJsonValue;
      return {
        id: row.id,
        normalizedType: row.normalized_type,
        title: formatRunEventTitle(row.normalized_type),
        detail: formatRunEventDetail(row.normalized_type, payload),
        occurredAt: toIso(row.first_seen_at) ?? new Date().toISOString(),
        waiting: WAITING_EVENT_TYPES.has(row.normalized_type),
      };
    }),
    tasks: taskRows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      currentRevision: row.current_revision,
    })),
    artifacts: artifactRows.map((row) => ({
      id: row.id,
      name: row.name,
      mimeType: row.mime_type,
      revision: row.revision,
      byteSize: row.byte_size,
    })),
    decisions: [
      ...approvalRows.map((row) => ({
        kind: "approval" as const,
        id: row.id,
        state: row.state,
        label: row.tool_name,
        waiting: row.state === "proposed",
      })),
      ...questionRows.map((row) => ({
        kind: "question" as const,
        id: row.id,
        state: row.state,
        label: formatQuestionPromptLabel(row.prompt_redacted_json as SafeJsonValue),
        waiting: row.state === "requested",
      })),
    ],
  };
}
