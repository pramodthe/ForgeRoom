import type postgres from "postgres";

export type SqlClient = postgres.Sql;

export type QuestionCardSnapshot = {
  id: string;
  requiredActionId: string;
  pauseGroupId: string;
  channelId: string;
  workspaceId: string;
  runId: string;
  runStepId: string;
  agentTurnId: string;
  coworkerId: string;
  coworkerHandle: string;
  coworkerName: string;
  promptHash: string;
  promptRedacted: unknown;
  state: string;
  expiresAt: string;
  pauseGroupState: string;
  pauseGroupRequiredActionCount: number;
  pauseGroupResolvedActionCount: number;
  pauseGroupHasPendingApprovals: boolean;
};

type QuestionRow = {
  id: string;
  required_action_id: string;
  channel_id: string;
  run_id: string;
  prompt_redacted_json: unknown;
  prompt_hash: string;
  state: string;
  expires_at: string | Date;
  pause_group_id: string;
  workspace_id: string;
  run_step_id: string;
  agent_turn_id: string;
  coworker_id: string;
  coworker_handle: string;
  coworker_name: string;
  pause_state: string;
  pause_required_count: number;
  pause_resolved_count: number;
  has_pending_approvals: boolean;
};

function toIso(value: string | Date): string {
  return typeof value === "string" ? new Date(value).toISOString() : value.toISOString();
}

function rowToSnapshot(row: QuestionRow): QuestionCardSnapshot {
  return {
    id: row.id,
    requiredActionId: row.required_action_id,
    pauseGroupId: row.pause_group_id,
    channelId: row.channel_id,
    workspaceId: row.workspace_id,
    runId: row.run_id,
    runStepId: row.run_step_id,
    agentTurnId: row.agent_turn_id,
    coworkerId: row.coworker_id,
    coworkerHandle: row.coworker_handle,
    coworkerName: row.coworker_name,
    promptHash: row.prompt_hash,
    promptRedacted: row.prompt_redacted_json,
    state: row.state,
    expiresAt: toIso(row.expires_at),
    pauseGroupState: row.pause_state,
    pauseGroupRequiredActionCount: row.pause_required_count,
    pauseGroupResolvedActionCount: row.pause_resolved_count,
    pauseGroupHasPendingApprovals: row.has_pending_approvals,
  };
}

async function selectQuestion(sql: SqlClient, questionId: string): Promise<QuestionRow | null> {
  const rows = await sql<QuestionRow[]>`
    SELECT
      q.id,
      q.required_action_id,
      q.channel_id,
      q.run_id,
      q.prompt_redacted_json,
      q.prompt_hash,
      q.state,
      q.expires_at,
      ra.pause_group_id,
      c.workspace_id,
      t.run_step_id,
      t.id AS agent_turn_id,
      cas.agent_profile_id AS coworker_id,
      cw.handle AS coworker_handle,
      cw.name AS coworker_name,
      pg.state AS pause_state,
      pg.required_action_count AS pause_required_count,
      pg.resolved_action_count AS pause_resolved_count,
      EXISTS (
        SELECT 1
        FROM action_proposals AS ap
        JOIN required_actions AS ra2 ON ra2.id = ap.required_action_id
        WHERE ra2.pause_group_id = pg.id
          AND ap.state = 'proposed'
          AND ra2.state = 'pending'
          AND ap.expires_at > NOW()
      ) AS has_pending_approvals
    FROM questions AS q
    JOIN required_actions AS ra ON ra.id = q.required_action_id
    JOIN pause_groups AS pg ON pg.id = ra.pause_group_id
    JOIN agent_turns AS t ON t.id = pg.agent_turn_id
    JOIN runs AS r ON r.id = q.run_id
    JOIN channels AS c ON c.id = r.channel_id
    JOIN channel_agent_sessions AS cas ON cas.id = t.channel_agent_session_id
    JOIN agent_profiles AS cw ON cw.id = cas.agent_profile_id
    WHERE q.id = ${questionId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function loadQuestionForCard(
  sql: SqlClient,
  input: { questionId: string; workspaceId: string },
): Promise<
  { ok: true; snapshot: QuestionCardSnapshot } | { ok: false; reason: "not_found" | "forbidden" }
> {
  const row = await selectQuestion(sql, input.questionId);
  if (!row) {
    return { ok: false, reason: "not_found" };
  }
  if (row.workspace_id !== input.workspaceId) {
    return { ok: false, reason: "forbidden" };
  }
  return { ok: true, snapshot: rowToSnapshot(row) };
}

export async function listPendingQuestionIds(
  sql: SqlClient,
  input: { channelId: string; workspaceId: string; now?: string },
): Promise<string[]> {
  const now = input.now ?? new Date().toISOString();
  const rows = await sql<{ id: string }[]>`
    SELECT q.id
    FROM questions AS q
    JOIN required_actions AS ra ON ra.id = q.required_action_id
    JOIN runs AS r ON r.id = q.run_id
    JOIN channels AS c ON c.id = r.channel_id
    WHERE r.channel_id = ${input.channelId}
      AND c.workspace_id = ${input.workspaceId}
      AND q.state = 'requested'
      AND ra.state = 'pending'
      AND q.expires_at > ${now}
    ORDER BY ra.created_at ASC
  `;
  return rows.map((row) => row.id);
}
