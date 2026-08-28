import { createHash } from "node:crypto";
import type {
  CoworkerDraft,
  CoworkerDraftConfirmCommand,
  CoworkerDraftCreateCommand,
  CoworkerDraftRejectCommand,
  CoworkerDraftReviseCommand,
  CoworkerProfile,
  SessionResponse,
} from "@forgeroom/contracts";
import { coworkerDraftSchema, coworkerProfileSchema } from "@forgeroom/contracts";
import {
  buildCoworkerDraftProposalFromRequest,
  hashCoworkerDraftBody,
  resolveCoworkerDraft,
} from "@forgeroom/domain";
import { canTransitionCoworkerDraft } from "@forgeroom/domain/transitions";
import type { TrueForgeClient } from "@forgeroom/trueforge";
import { randomOpaqueId } from "../auth/crypto";
import { ensureCoworkerChannelSession } from "./session-provision";
import type { CoworkerDraftRecord, CoworkerEditableConfig, WorkspaceCatalogStore } from "./store";
import type { ApiEnv } from "../env";
import type { WorkspaceServiceResult } from "./service";

export type CoworkerDraftDeps = {
  store: WorkspaceCatalogStore;
  now: () => Date;
  trueforgeClient?: TrueForgeClient;
  apiEnv?: ApiEnv;
  sql?: ReturnType<typeof import("@forgeroom/db").createSql>;
  specHash: (config: Record<string, unknown>) => string;
};

function specHashFromProposal(
  proposal: CoworkerDraftRecord["proposal"],
  effectivePreview: CoworkerDraftRecord["effectivePreview"],
  specHash: CoworkerDraftDeps["specHash"],
): string {
  const config: CoworkerEditableConfig = {
    standing_instructions: proposal.standing_instructions,
    model_preset: proposal.model_preset,
    budget: proposal.budget,
    channel_ids: [...proposal.channel_ids],
    task_record_grants: proposal.task_record_grants.map((grant) => ({
      channel_id: grant.channel_id,
      operations: [...grant.operations],
    })),
    tool_grants: [...proposal.tool_grants],
    skill_version_ids: [...proposal.skill_version_ids],
    component_version_ids: [...proposal.component_version_ids],
    sandbox: effectivePreview.sandbox,
  };
  return specHash({
    ...config,
    name: proposal.name,
    handle: proposal.handle,
    title: proposal.title,
    native_subagents_enabled: false,
  });
}

export function toCoworkerDraft(row: CoworkerDraftRecord): CoworkerDraft {
  return coworkerDraftSchema.parse({
    schemaVersion: 1,
    id: row.id,
    workspace_id: row.workspaceId,
    revision: row.revision,
    draft_hash: row.draftHash,
    policy_revision: row.policyRevision,
    catalog_revision: row.catalogRevision,
    state: row.state,
    proposal: row.proposal,
    effective_preview: row.effectivePreview,
    created_by: row.createdBy,
    expires_at: row.expiresAt,
    created_at: row.createdAt,
  });
}

function toCoworkerProfile(row: {
  id: string;
  workspaceId: string;
  handle: string;
  name: string;
  title: string;
  status: "active" | "disabled";
  currentVersionId: string | null;
  configRevision: number;
}): CoworkerProfile {
  return coworkerProfileSchema.parse({
    schemaVersion: 1,
    id: row.id,
    workspace_id: row.workspaceId,
    handle: row.handle,
    name: row.name,
    title: row.title,
    status: row.status,
    native_subagents_enabled: false,
    current_version_id: row.currentVersionId,
    config_revision: row.configRevision,
  });
}

async function assignableChannelIds(
  store: WorkspaceCatalogStore,
  workspaceId: string,
): Promise<string[]> {
  const channels = await store.listChannels(workspaceId);
  return channels.filter((channel) => channel.status === "active").map((channel) => channel.id);
}

async function existingHandles(
  store: WorkspaceCatalogStore,
  workspaceId: string,
): Promise<string[]> {
  const rows = await store.listCoworkers(workspaceId);
  return rows.map((row) => row.handle);
}

async function insertResolvedDraft(
  deps: CoworkerDraftDeps,
  input: {
    draftId?: string;
    workspaceId: string;
    createdBy: string;
    request: string;
    revision: number;
    supersedeOthers: boolean;
  },
): Promise<CoworkerDraftRecord> {
  const untrusted = buildCoworkerDraftProposalFromRequest({ request: input.request });
  const resolved = resolveCoworkerDraft({
    proposal: untrusted,
    workspaceId: input.workspaceId,
    assignableChannelIds: await assignableChannelIds(deps.store, input.workspaceId),
    existingHandles: await existingHandles(deps.store, input.workspaceId),
    now: deps.now(),
  });
  const createdAt = deps.now().toISOString();
  const draft: CoworkerDraftRecord = {
    id: input.draftId ?? randomOpaqueId("cwd"),
    workspaceId: input.workspaceId,
    revision: input.revision,
    draftHash: resolved.draftHash,
    policyRevision: resolved.policyRevision,
    catalogRevision: resolved.catalogRevision,
    state: "awaiting_review",
    proposal: resolved.proposal,
    effectivePreview: resolved.effectivePreview,
    sourceTextEncrypted: resolved.sourceTextEncrypted,
    createdBy: input.createdBy,
    expiresAt: resolved.expiresAt,
    createdAt,
    decidedAt: null,
  };
  if (input.supersedeOthers) {
    await deps.store.supersedeCoworkerDrafts({
      workspaceId: input.workspaceId,
      supersededBefore: createdAt,
      exceptDraftId: draft.id,
    });
  }
  await deps.store.insertCoworkerDraft(draft);
  return draft;
}

export async function createCoworkerDraft(
  deps: CoworkerDraftDeps,
  session: SessionResponse,
  workspaceId: string,
  command: CoworkerDraftCreateCommand,
  draftId?: string,
): Promise<WorkspaceServiceResult<CoworkerDraft>> {
  if (session.workspace_id !== workspaceId) {
    return { ok: false, error: { code: "forbidden", message: "Workspace access denied." } };
  }
  const draft = await insertResolvedDraft(deps, {
    draftId,
    workspaceId,
    createdBy: session.user.id,
    request: command.request,
    revision: 1,
    supersedeOthers: true,
  });
  return { ok: true, value: toCoworkerDraft(draft) };
}

export async function getCoworkerDraftForSession(
  deps: CoworkerDraftDeps,
  session: SessionResponse,
  draftId: string,
): Promise<WorkspaceServiceResult<CoworkerDraft>> {
  const draft = await deps.store.getCoworkerDraft(draftId);
  if (!draft || draft.workspaceId !== session.workspace_id) {
    return { ok: false, error: { code: "not_found", message: "Coworker draft not found." } };
  }
  return { ok: true, value: toCoworkerDraft(draft) };
}

export async function reviseCoworkerDraft(
  deps: CoworkerDraftDeps,
  session: SessionResponse,
  draftId: string,
  command: CoworkerDraftReviseCommand,
): Promise<WorkspaceServiceResult<CoworkerDraft>> {
  const current = await deps.store.getCoworkerDraft(draftId);
  if (!current || current.workspaceId !== session.workspace_id) {
    return { ok: false, error: { code: "not_found", message: "Coworker draft not found." } };
  }
  if (current.state !== "awaiting_review" && current.state !== "draft") {
    return {
      ok: false,
      error: { code: "conflict", message: "Only reviewable drafts may be revised." },
    };
  }
  if (current.revision !== command.draft_revision || current.draftHash !== command.draft_hash) {
    return {
      ok: false,
      error: {
        code: "stale_coworker_draft",
        message: "Coworker draft changed; review the latest revision.",
        details: { draft: toCoworkerDraft(current) },
      },
    };
  }
  await deps.store.updateCoworkerDraftState({
    draftId,
    expectedRevision: current.revision,
    nextState: "superseded",
    decidedAt: deps.now().toISOString(),
  });
  const next = await insertResolvedDraft(deps, {
    workspaceId: current.workspaceId,
    createdBy: session.user.id,
    request: command.revision_request,
    revision: current.revision + 1,
    supersedeOthers: false,
  });
  return { ok: true, value: toCoworkerDraft(next) };
}

export async function rejectCoworkerDraft(
  deps: CoworkerDraftDeps,
  session: SessionResponse,
  draftId: string,
  command: CoworkerDraftRejectCommand,
): Promise<WorkspaceServiceResult<CoworkerDraft>> {
  const current = await deps.store.getCoworkerDraft(draftId);
  if (!current || current.workspaceId !== session.workspace_id) {
    return { ok: false, error: { code: "not_found", message: "Coworker draft not found." } };
  }
  if (current.revision !== command.draft_revision || current.draftHash !== command.draft_hash) {
    return {
      ok: false,
      error: {
        code: "stale_coworker_draft",
        message: "Coworker draft changed; review the latest revision.",
        details: { draft: toCoworkerDraft(current) },
      },
    };
  }
  if (!canTransitionCoworkerDraft(current.state, "rejected")) {
    return {
      ok: false,
      error: { code: "conflict", message: "Coworker draft cannot be rejected." },
    };
  }
  const updated = await deps.store.updateCoworkerDraftState({
    draftId,
    expectedRevision: current.revision,
    nextState: "rejected",
    decidedAt: deps.now().toISOString(),
  });
  if (!updated) {
    return {
      ok: false,
      error: {
        code: "stale_coworker_draft",
        message: "Coworker draft changed; review the latest revision.",
        details: { draft: toCoworkerDraft(current) },
      },
    };
  }
  return { ok: true, value: toCoworkerDraft(updated) };
}

export async function confirmCoworkerDraftBody(
  deps: CoworkerDraftDeps,
  session: SessionResponse,
  draftId: string,
  command: CoworkerDraftConfirmCommand,
): Promise<
  WorkspaceServiceResult<{
    draft: CoworkerDraft;
    coworker: CoworkerProfile;
    provisioning_error?: string;
  }>
> {
  const current = await deps.store.getCoworkerDraft(draftId);
  if (!current || current.workspaceId !== session.workspace_id) {
    return { ok: false, error: { code: "not_found", message: "Coworker draft not found." } };
  }

  if (new Date(deps.now()).getTime() > new Date(current.expiresAt).getTime()) {
    if (current.state === "awaiting_review") {
      await deps.store.updateCoworkerDraftState({
        draftId,
        expectedRevision: current.revision,
        nextState: "expired",
        decidedAt: deps.now().toISOString(),
      });
    }
    return {
      ok: false,
      error: { code: "expired_proposal", message: "Coworker draft expired; create a new draft." },
    };
  }

  const coworkerId = randomOpaqueId("cw");
  const versionId = randomOpaqueId("av");
  const createdAt = deps.now().toISOString();
  const provisioned = await deps.store.provisionCoworkerFromDraft({
    draftId,
    expectedRevision: command.draft_revision,
    expectedHash: command.draft_hash,
    expectedPolicyRevision: command.policy_revision,
    expectedCatalogRevision: command.catalog_revision,
    actorId: session.user.id,
    idempotencyKey: command.idempotency_key,
    now: createdAt,
    coworkerId,
    versionId,
    createdAt,
    specHash: specHashFromProposal(current.proposal, current.effectivePreview, deps.specHash),
  });

  if (!provisioned.ok) {
    if (provisioned.reason === "stale" && provisioned.draft) {
      return {
        ok: false,
        error: {
          code: "stale_coworker_draft",
          message: "Coworker draft changed; review the latest revision.",
          details: { draft: toCoworkerDraft(provisioned.draft) },
        },
      };
    }
    if (provisioned.reason === "expired") {
      return {
        ok: false,
        error: { code: "expired_proposal", message: "Coworker draft expired; create a new draft." },
      };
    }
    if (provisioned.reason === "handle_conflict") {
      return {
        ok: false,
        error: {
          code: "conflict",
          message: "A coworker with this handle already exists.",
          details: { handle: current.proposal.handle },
        },
      };
    }
    return {
      ok: false,
      error: { code: "conflict", message: "Coworker draft cannot be confirmed." },
    };
  }

  const coworker = provisioned.coworker;
  if (!coworker) {
    return {
      ok: false,
      error: {
        code: "conflict",
        message: "Coworker draft confirmation did not produce a profile.",
      },
    };
  }

  let provisioningError: string | undefined;
  if (deps.trueforgeClient) {
    for (const channelId of coworker.editableConfigJson.channel_ids) {
      try {
        await ensureCoworkerChannelSession({
          store: deps.store,
          workspaceId: coworker.workspaceId,
          channelId,
          coworker,
          createdBy: session.user.id,
          client: deps.trueforgeClient,
          ...(deps.apiEnv ? { apiEnv: deps.apiEnv } : {}),
          ...(deps.sql ? { sql: deps.sql } : {}),
        });
      } catch (error) {
        provisioningError =
          error instanceof Error ? error.message : "TrueForge session provisioning failed.";
        await deps.store.updateCoworkerDraftState({
          draftId,
          expectedRevision: provisioned.draft.revision,
          nextState: "failed_provisioning",
        });
        return {
          ok: false,
          error: {
            code: "coworker_provisioning_failed",
            message: provisioningError,
            details: {
              draft_id: draftId,
              coworker_id: coworker.id,
              retryable: true,
            },
          },
        };
      }
    }
  }

  return {
    ok: true,
    value: {
      draft: toCoworkerDraft(provisioned.draft),
      coworker: toCoworkerProfile(coworker),
      ...(provisioningError ? { provisioning_error: provisioningError } : {}),
    },
  };
}

export function refreshCoworkerDraftIfStale(
  deps: CoworkerDraftDeps,
  draft: CoworkerDraftRecord,
): CoworkerDraftRecord | null {
  const currentHash = hashCoworkerDraftBody({
    proposal: draft.proposal,
    effectivePreview: draft.effectivePreview,
    policyRevision: draft.policyRevision,
    catalogRevision: draft.catalogRevision,
  });
  if (currentHash === draft.draftHash) {
    return null;
  }
  void deps;
  return draft;
}

export function coworkerDraftResultId(draftId: string): string {
  return draftId;
}

export function coworkerConfirmResultId(draftId: string, coworkerId: string): string {
  return createHash("sha256").update(`${draftId}:${coworkerId}`).digest("hex").slice(0, 32);
}
