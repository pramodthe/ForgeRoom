import { coworkerDraftSchema, type CoworkerDraft } from "@forgeroom/contracts";
import { ApiError } from "../api/http-client";

const COWORKER_DRAFT_STORAGE_PREFIX = "forgeroom:review:coworker-draft:";
const SKILL_DRAFT_STORAGE_PREFIX = "forgeroom:review:skill-draft:";

function reviewStorage(): Storage | null {
  try {
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
}

export function persistCoworkerDraftReview(workspaceId: string, draftId: string): void {
  reviewStorage()?.setItem(`${COWORKER_DRAFT_STORAGE_PREFIX}${workspaceId}`, draftId);
}

export function readCoworkerDraftReview(workspaceId: string): string | null {
  return reviewStorage()?.getItem(`${COWORKER_DRAFT_STORAGE_PREFIX}${workspaceId}`) ?? null;
}

export function clearCoworkerDraftReview(workspaceId: string): void {
  reviewStorage()?.removeItem(`${COWORKER_DRAFT_STORAGE_PREFIX}${workspaceId}`);
}

export function persistSkillDraftReview(runId: string, draftId: string): void {
  reviewStorage()?.setItem(`${SKILL_DRAFT_STORAGE_PREFIX}${runId}`, draftId);
}

export function readSkillDraftReview(runId: string): string | null {
  return reviewStorage()?.getItem(`${SKILL_DRAFT_STORAGE_PREFIX}${runId}`) ?? null;
}

export function clearSkillDraftReview(runId: string): void {
  reviewStorage()?.removeItem(`${SKILL_DRAFT_STORAGE_PREFIX}${runId}`);
}

export function parseCoworkerDraftFromError(error: unknown): CoworkerDraft | null {
  if (!(error instanceof ApiError) || error.code !== "stale_coworker_draft") {
    return null;
  }
  const draft = error.details.draft;
  if (!draft) return null;
  return coworkerDraftSchema.safeParse(draft).success ? coworkerDraftSchema.parse(draft) : null;
}

export function isStaleTaskRevision(error: unknown): error is ApiError {
  return error instanceof ApiError && error.code === "stale_task_revision";
}

export function buildFixtureCoworkerDraft(workspaceId: string, _request: string): CoworkerDraft {
  return coworkerDraftSchema.parse({
    schemaVersion: 1,
    id: "cwd_fixture_research_001",
    workspace_id: workspaceId,
    revision: 1,
    draft_hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    policy_revision: 1,
    catalog_revision: 1,
    state: "awaiting_review",
    proposal: {
      schemaVersion: 1,
      name: "Researcher",
      handle: "researcher",
      title: "Customer research specialist",
      standing_instructions:
        "Analyze support and GitHub evidence, identify customer patterns, and prepare sourced briefings.",
      model_preset: "default",
      native_subagents_enabled: false,
      channel_ids: ["ch_general_001"],
      budget: { max_turn_tokens: 12_000, max_tool_calls: 20 },
      task_record_grants: [
        {
          channel_id: "ch_general_001",
          operations: ["create", "update_status", "update_fields"],
        },
      ],
      tool_grants: ["GITHUB_GET_ISSUES", "SUPPORT_SEARCH"],
      skill_version_ids: ["skill_version_001"],
      component_version_ids: [],
    },
    effective_preview: {
      schemaVersion: 1,
      model: "default",
      tools: ["GITHUB_GET_ISSUES", "SUPPORT_SEARCH"],
      skills: ["skill_version_001"],
      components: [],
      account: "Workspace service account",
      channels: ["ch_general_001"],
      sandbox: false,
      denials: ["write_tools", "native_subagents", "knowledge_memory_workflow_unsupported_in_p0"],
      native_subagents_enabled: false,
    },
    created_by: "user_owner_001",
    expires_at: "2099-01-01T00:00:00.000Z",
    created_at: new Date().toISOString(),
  });
}

export function formatTaskRecordGrant(grant: { channel_id: string; operations: string[] }): string {
  return `${grant.channel_id}: ${grant.operations.join(", ")}`;
}
