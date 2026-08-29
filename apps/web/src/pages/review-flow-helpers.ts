import {
  coworkerDraftSchema,
  type CoworkerDraft,
  type CoworkerDraftState,
  type TaskRevision,
} from "@forgeroom/contracts";
import { getCoworkerDraft } from "../api/workspace-api";
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

export function friendlyApiError(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error.message : "Something went wrong.";
  }
  switch (error.code) {
    case "stale_task_revision":
      return "This task was updated elsewhere. Review the latest revision and try again.";
    case "stale_coworker_draft":
      return "The coworker draft changed on the server. Review the updated revision.";
    case "manifest_mismatch":
      return "The skill manifest no longer matches the coworker grants. Review requirements before attaching.";
    case "config_revision_mismatch":
      return "The coworker changed while attaching the skill. Refresh and try again.";
    case "coworker_provisioning_failed":
      return error.message;
    case "expired_proposal":
      return "This draft expired. Start a new coworker request.";
    default:
      return error.message;
  }
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

export type ToolRiskClass = "read" | "write" | "destructive";

export function classifyToolRisk(toolName: string): ToolRiskClass {
  const normalized = toolName.toUpperCase();
  if (
    normalized.includes("DELETE") ||
    normalized.includes("REMOVE") ||
    normalized.includes("DESTROY")
  ) {
    return "destructive";
  }
  if (
    normalized.includes("ADD") ||
    normalized.includes("CREATE") ||
    normalized.includes("UPDATE") ||
    normalized.includes("WRITE") ||
    normalized.includes("POST") ||
    normalized.includes("PUT") ||
    normalized.includes("PATCH")
  ) {
    return "write";
  }
  return "read";
}

export function summarizeToolEffects(tools: string[]): Record<ToolRiskClass, string[]> {
  const grouped: Record<ToolRiskClass, string[]> = { read: [], write: [], destructive: [] };
  for (const tool of tools) {
    grouped[classifyToolRisk(tool)].push(tool.replaceAll("_", " "));
  }
  return grouped;
}

const TERMINAL_COWORKER_DRAFT_STATES = new Set<CoworkerDraftState>([
  "ready",
  "failed_provisioning",
  "expired",
  "rejected",
  "superseded",
]);

export function isTerminalCoworkerDraftState(state: CoworkerDraftState): boolean {
  return TERMINAL_COWORKER_DRAFT_STATES.has(state);
}

export async function pollCoworkerDraftUntilTerminal(
  draftId: string,
  options?: { intervalMs?: number; maxAttempts?: number },
): Promise<CoworkerDraft> {
  const intervalMs = options?.intervalMs ?? 750;
  const maxAttempts = options?.maxAttempts ?? 40;
  let latest = await getCoworkerDraft({ draftId });
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (isTerminalCoworkerDraftState(latest.state)) return latest;
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
    latest = await getCoworkerDraft({ draftId });
  }
  return latest;
}

export function formatTaskRevisionSummary(revision: TaskRevision): {
  title: string;
  detail: string;
} {
  if (revision.changed_fields.includes("created")) {
    const status = revision.data.status;
    return {
      title: "Task created",
      detail: `Initial status ${typeof status === "string" ? status.replace("_", " ") : "todo"}`,
    };
  }
  if (revision.changed_fields.includes("status")) {
    const status = revision.data.status;
    return {
      title: `Status → ${typeof status === "string" ? status.replace("_", " ") : "updated"}`,
      detail: `Revision ${revision.revision} by ${revision.actor_type}`,
    };
  }
  return {
    title: `Updated ${revision.changed_fields.join(", ")}`,
    detail: `Revision ${revision.revision} by ${revision.actor_type}`,
  };
}
