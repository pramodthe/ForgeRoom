import type postgres from "postgres";
import type { SafeJsonValue, SkillDraft } from "@forgeroom/contracts";
import { skillDraftSchema } from "@forgeroom/contracts";
import {
  buildSkillDraft,
  buildSkillDraftMarkdown,
  hashSkillMarkdown,
  type SkillRunEvidence,
} from "@forgeroom/domain";
import { loadRunDetail } from "./run-detail";

type SqlClient = postgres.Sql;

function normalizePayload(value: unknown): SafeJsonValue {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as SafeJsonValue;
    } catch {
      return value;
    }
  }
  return value as SafeJsonValue;
}

export type LoadSkillRunEvidenceResult =
  | { ok: true; evidence: SkillRunEvidence; workspaceId: string; channelId: string }
  | { ok: false; code: "not_found" | "forbidden"; message: string };

export async function loadSkillRunEvidence(
  sql: SqlClient,
  input: {
    runId: string;
    workspaceId: string;
    sourceStepIds: string[];
  },
): Promise<LoadSkillRunEvidenceResult> {
  const detail = await loadRunDetail(sql, input.runId);
  if (!detail || detail.workspaceId !== input.workspaceId) {
    return { ok: false, code: "not_found", message: "Run not found." };
  }

  const eventRows = await sql<
    {
      normalized_type: string;
      normalized_payload_redacted_json: unknown;
      run_step_id: string;
    }[]
  >`
    SELECT re.normalized_type, re.normalized_payload_redacted_json, rs.id AS run_step_id
    FROM run_events AS re
    JOIN agent_turns AS at ON at.id = re.agent_turn_id
    JOIN run_steps AS rs ON rs.id = at.run_step_id
    WHERE rs.run_id = ${input.runId}
    ORDER BY re.first_seen_at ASC, re.id ASC
  `;
  const selectedStepIds = new Set(input.sourceStepIds);

  const approvalRows = await sql<{ tool_name: string; state: string }[]>`
    SELECT tool_name, state
    FROM action_proposals
    WHERE run_id = ${input.runId}
    ORDER BY id ASC
  `;

  const componentRows = await sql<{ component_version_id: string }[]>`
    SELECT DISTINCT component_version_id
    FROM ui_instances
    WHERE run_id = ${input.runId}
    ORDER BY component_version_id ASC
  `;

  return {
    ok: true,
    workspaceId: detail.workspaceId,
    channelId: detail.run.channel_id,
    evidence: {
      runId: detail.run.id,
      goal: detail.run.goal,
      sourceMessageBody: detail.sourceMessageBody,
      lifecycle: detail.run.lifecycle,
      sourceStepIds: input.sourceStepIds,
      steps: detail.run.steps,
      events: eventRows
        .filter((row) => selectedStepIds.has(String(row.run_step_id)))
        .map((row) => ({
          normalizedType: row.normalized_type,
          payloadRedacted: normalizePayload(row.normalized_payload_redacted_json),
        })),
      approvals: approvalRows.map((row) => ({
        toolName: row.tool_name,
        state: row.state,
      })),
      artifacts: detail.artifacts.map((artifact) => ({
        id: artifact.id,
        name: artifact.name,
      })),
      tasks: detail.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
      })),
      componentVersionIds: componentRows.map((row) => row.component_version_id),
    },
  };
}

export type SkillDraftRow = {
  id: string;
  skillId: string;
  workspaceId: string;
  manifestJson: unknown;
};

function parseManifestJson(manifestJson: unknown): unknown {
  if (typeof manifestJson === "string") {
    try {
      return JSON.parse(manifestJson) as unknown;
    } catch {
      return manifestJson;
    }
  }
  return manifestJson;
}

function parseManifestDraft(manifestJson: unknown): SkillDraft | null {
  const parsed = skillDraftSchema.safeParse(parseManifestJson(manifestJson));
  return parsed.success ? parsed.data : null;
}

export async function getSkillDraftById(
  sql: SqlClient,
  draftId: string,
): Promise<{ draft: SkillDraft; skillId: string; workspaceId: string } | null> {
  const rows = await sql<
    {
      id: string;
      skill_id: string;
      workspace_id: string;
      manifest_json: unknown;
      state: string;
    }[]
  >`
    SELECT sv.id, sv.skill_id, s.workspace_id, sv.manifest_json, sv.state
    FROM skill_versions AS sv
    JOIN skills AS s ON s.id = sv.skill_id
    WHERE sv.id = ${draftId}
      AND sv.state = 'draft'
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) {
    return null;
  }
  const draft = parseManifestDraft(row.manifest_json);
  if (!draft) {
    return null;
  }
  return { draft, skillId: row.skill_id, workspaceId: row.workspace_id };
}

export type CreateSkillDraftInput = {
  workspaceId: string;
  channelId: string;
  createdBy: string;
  draftId: string;
  skillId: string;
  stableName: string;
  displayName: string;
  evidence: SkillRunEvidence;
  now: string;
};

export async function createSkillDraftRecord(
  sql: SqlClient,
  input: CreateSkillDraftInput,
): Promise<SkillDraft> {
  const draft = buildSkillDraft({
    evidence: input.evidence,
    workspaceId: input.workspaceId,
    draftId: input.draftId,
    createdBy: input.createdBy,
    createdAt: input.now,
  });
  const markdown = buildSkillDraftMarkdown({
    when_to_use: draft.when_to_use,
    inputs: draft.inputs,
    method: draft.method,
    validation: draft.validation,
    output: draft.output,
    failures: draft.failures,
    required_tools: draft.required_tools,
    required_components: draft.required_components,
    required_approvals: draft.required_approvals,
  });
  const contentHash = hashSkillMarkdown(markdown);
  const manifestHash = draft.draft_hash;

  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO skills (
        id, workspace_id, stable_name, display_name, owner_user_id, visibility, status,
        current_version_id, created_at, updated_at
      ) VALUES (
        ${input.skillId}, ${input.workspaceId}, ${input.stableName}, ${input.displayName},
        ${input.createdBy}, 'private', 'active', ${input.draftId}, ${input.now}, ${input.now}
      )
    `;
    await tx`
      INSERT INTO skill_versions (
        id, skill_id, version, state, manifest_json, manifest_hash, skill_markdown_blob_key,
        content_hash, source_run_id, source_step_ids_json, created_by, created_at, published_at
      ) VALUES (
        ${input.draftId}, ${input.skillId}, 1, 'draft', ${JSON.stringify(draft)}::jsonb,
        ${manifestHash}, ${`drafts/${input.draftId}/SKILL.md`}, ${contentHash},
        ${input.evidence.runId}, ${JSON.stringify(input.evidence.sourceStepIds)}::jsonb,
        ${input.createdBy}, ${input.now}, NULL
      )
    `;
    const channels = await tx<{ next_sequence: number }[]>`
      SELECT next_sequence
      FROM channels
      WHERE id = ${input.channelId}
      FOR UPDATE
    `;
    const sequence = channels[0]?.next_sequence ?? 0;
    await tx`
      INSERT INTO channel_events (
        id, channel_id, sequence, type, actor_type, actor_id, run_id, payload_json, created_at
      ) VALUES (
        ${`${input.draftId}_event`},
        ${input.channelId},
        ${sequence},
        'custom',
        'human',
        ${input.createdBy},
        ${input.evidence.runId},
        ${JSON.stringify({
          event_kind: "skill.draft_created",
          skill_draft_id: input.draftId,
          skill_id: input.skillId,
          source_run_id: input.evidence.runId,
        })}::jsonb,
        ${input.now}
      )
    `;
    await tx`
      UPDATE channels
      SET next_sequence = ${sequence + 1}, updated_at = ${input.now}
      WHERE id = ${input.channelId}
    `;
  });

  return draft;
}

export function slugifySkillStableName(goal: string, runId: string): string {
  const slug = goal
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  const suffix = runId
    .replace(/[^a-z0-9]+/gi, "")
    .slice(-8)
    .toLowerCase();
  return slug.length > 0 ? `${slug}_${suffix}` : `skill_${suffix}`;
}
