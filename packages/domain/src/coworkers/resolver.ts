import { createHash } from "node:crypto";
import type { CoworkerEffectivePreview, CoworkerProposal } from "@forgeroom/contracts";
import { isReservedCoworkerHandle } from "@forgeroom/contracts";
import { P0_COMPOSIO_DIRECT_TOOLS } from "@forgeroom/composio";
import { canonicalizeJson } from "../components/jcs";
import type { CoworkerDraftProposalV1 } from "./builder";
import {
  COWORKER_DRAFT_TTL_MS,
  P0_COWORKER_CATALOG_REVISION,
  P0_COWORKER_POLICY_REVISION,
  P0_WRITE_TOOL_DENIALS,
  RESEARCH_READ_TOOL_SLUG,
  WORKSPACE_SERVICE_ACCOUNT_LABEL,
} from "./constants";

export type ResolveCoworkerDraftInput = {
  proposal: CoworkerDraftProposalV1;
  workspaceId: string;
  /** Active channel ids the creator may assign (private channels excluded when unauthorized). */
  assignableChannelIds: string[];
  /** Existing coworker handles in the workspace (lowercase). */
  existingHandles: string[];
  now?: Date;
};

export type ResolvedCoworkerDraft = {
  proposal: CoworkerProposal;
  effectivePreview: CoworkerEffectivePreview;
  draftHash: string;
  policyRevision: number;
  catalogRevision: number;
  expiresAt: string;
  sourceTextEncrypted: string;
};

function slugifyHandle(displayName: string): string {
  const slug = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug.length > 0 ? slug : "coworker";
}

function uniqueHandle(base: string, existingHandles: string[]): string {
  const lowered = new Set(existingHandles.map((handle) => handle.toLowerCase()));
  let candidate = base;
  let suffix = 2;
  while (isReservedCoworkerHandle(candidate) || lowered.has(candidate.toLowerCase())) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function buildDenials(proposal: CoworkerDraftProposalV1): string[] {
  const denials: string[] = [];

  if (proposal.approvalIntent !== "read_only") {
    denials.push("write_tools: approval intent limited to read-only in P0 research drafts");
  }

  for (const tool of P0_WRITE_TOOL_DENIALS) {
    denials.push(`write_tools: ${tool} denied (read-only profile)`);
  }

  for (const tool of P0_COMPOSIO_DIRECT_TOOLS) {
    if (tool !== RESEARCH_READ_TOOL_SLUG && !P0_WRITE_TOOL_DENIALS.includes(tool as never)) {
      denials.push(`unavailable_tool: ${tool}`);
    }
  }

  denials.push("destructive_tools: no destructive Composio tools in P0 catalogue");
  denials.push("new_account_connection: P0 uses the pinned workspace service account only");
  denials.push("native_subagents: disabled in P0 feature profile");
  denials.push("knowledge_memory_workflow_unsupported_in_p0");
  denials.push("web_data: no verified Composio web read toolkit in P0 catalogue");

  if (proposal.requestedKnowledgeScopes.length > 0) {
    denials.push("knowledge_scopes: unsupported in P0");
  }
  if (proposal.requestedMemoryScopes.length > 0) {
    denials.push("memory_scopes: unsupported in P0");
  }
  if (proposal.requestedRecordCapabilities.length > 0) {
    denials.push("workflow_records: unsupported in P0");
  }
  if (proposal.nativeSubagentsRequested) {
    denials.push("native_subagents_requested: denied in P0");
  }
  if (proposal.sandboxRequested) {
    denials.push("sandbox: not requested for read-only research profile");
  }

  for (const connection of proposal.requestedConnections) {
    if (connection.effects.some((effect) => effect === "write" || effect === "destructive")) {
      denials.push(`connection_effects: ${connection.connector} write/destructive denied`);
    }
  }

  return denials;
}

function resolveTools(proposal: CoworkerDraftProposalV1): string[] {
  if (proposal.approvalIntent !== "read_only") {
    return [];
  }
  const wantsGithubRead = proposal.requestedConnections.some(
    (connection) => connection.connector === "github" && connection.effects.includes("read"),
  );
  if (!wantsGithubRead) {
    return [];
  }
  return [RESEARCH_READ_TOOL_SLUG];
}

export function encryptCoworkerDraftSource(source: string): string {
  return `enc:v1:${Buffer.from(source, "utf8").toString("base64url")}`;
}

export function hashCoworkerDraftBody(body: {
  proposal: CoworkerProposal;
  effectivePreview: CoworkerEffectivePreview;
  policyRevision: number;
  catalogRevision: number;
}): string {
  const preimage = {
    proposal: body.proposal,
    effective_preview: body.effectivePreview,
    policy_revision: body.policyRevision,
    catalog_revision: body.catalogRevision,
  };
  return `sha256:${createHash("sha256").update(canonicalizeJson(preimage)).digest("hex")}`;
}

export function resolveCoworkerDraft(input: ResolveCoworkerDraftInput): ResolvedCoworkerDraft {
  const now = input.now ?? new Date();
  const baseHandle = slugifyHandle(input.proposal.displayName);
  const handle = uniqueHandle(baseHandle, input.existingHandles);
  const channelIds =
    input.proposal.requestedChannels.length > 0
      ? input.assignableChannelIds.filter((id) =>
          input.proposal.requestedChannels.includes(id),
        )
      : input.assignableChannelIds.slice(0, 1);

  const toolGrants = resolveTools(input.proposal);
  const denials = buildDenials(input.proposal);

  const proposal: CoworkerProposal = {
    schemaVersion: 1,
    name: input.proposal.displayName,
    handle,
    title: input.proposal.title,
    standing_instructions: input.proposal.instructions,
    model_preset: input.proposal.modelPresetName ?? "openai/gpt-5-4-mini",
    native_subagents_enabled: false,
    channel_ids: channelIds,
    budget: { max_turn_tokens: 12_000, max_tool_calls: 20 },
    task_record_grants: [],
    tool_grants: toolGrants,
    skill_version_ids: [],
    component_version_ids: [],
  };

  const effectivePreview: CoworkerEffectivePreview = {
    schemaVersion: 1,
    model: proposal.model_preset,
    tools: [...toolGrants],
    skills: [],
    components: [],
    account: WORKSPACE_SERVICE_ACCOUNT_LABEL,
    channels: [...channelIds],
    sandbox: false,
    denials,
    native_subagents_enabled: false,
  };

  const policyRevision = P0_COWORKER_POLICY_REVISION;
  const catalogRevision = P0_COWORKER_CATALOG_REVISION;
  const draftHash = hashCoworkerDraftBody({ proposal, effectivePreview, policyRevision, catalogRevision });

  return {
    proposal,
    effectivePreview,
    draftHash,
    policyRevision,
    catalogRevision,
    expiresAt: new Date(now.getTime() + COWORKER_DRAFT_TTL_MS).toISOString(),
    sourceTextEncrypted: encryptCoworkerDraftSource(input.proposal.job),
  };
}
