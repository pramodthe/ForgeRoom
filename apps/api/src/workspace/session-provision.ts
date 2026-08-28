import type { CompiledSessionRevision } from "@forgeroom/orchestration/session";
import { provisionChannelCoworkerSession } from "@forgeroom/orchestration/session";
import { intersectEffectiveComponentTools } from "@forgeroom/orchestration/capability-intersection";
import { loadControlledComponentCandidates, type createSql } from "@forgeroom/db";
import { loadTrueForgeClientFromEnv, type TrueForgeClient } from "@forgeroom/trueforge";
import type { ChannelAgentSessionRecord, CoworkerRecord, WorkspaceCatalogStore } from "./store";
import type { ApiEnv } from "../env";

type SqlClient = ReturnType<typeof createSql>;

export type SessionRevisionRecord = {
  id: string;
  agentProfileId: string;
  sourceConfigRevision: number;
  effectiveConfigRedactedJson: Record<string, unknown>;
  effectiveSpecHash: string;
  approvalPolicyHash: string;
  createdBy: string;
  createdAt: string;
};

export type ChannelAgentSessionGenerationRecord = {
  id: string;
  channelAgentSessionId: string;
  generation: number;
  agentVersionId: string | null;
  sessionRevisionId: string;
  trueforgeSessionId: string;
  effectiveSpecHash: string;
  approvalPolicyHash: string;
  activeTurnId: string | null;
  state: "provisioning" | "ready" | "rotating" | "retired" | "failed";
  createdAt: string;
  retiredAt: string | null;
};

export function sandboxEnabledFromCoworker(coworker: CoworkerRecord): boolean {
  return coworker.editableConfigJson.sandbox ?? true;
}

export function standingInstructionsFromCoworker(coworker: CoworkerRecord): string | undefined {
  const value = coworker.editableConfigJson.standing_instructions;
  return value.trim().length > 0 ? value : undefined;
}

export function modelPresetFromCoworker(coworker: CoworkerRecord): string {
  const preset = coworker.editableConfigJson.model_preset?.trim();
  return preset && preset.length > 0 ? preset : "openai/gpt-5-4-mini";
}

export function connectorsFromCoworker(coworker: CoworkerRecord): Array<{
  name: string;
  enabledTools: string[];
  approvalRequiredTools: string[];
}> {
  const config = coworker.editableConfigJson as Record<string, unknown>;
  const raw = config.connectors;
  if (!Array.isArray(raw)) {
    return [];
  }
  const connectors: Array<{
    name: string;
    enabledTools: string[];
    approvalRequiredTools: string[];
  }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as Record<string, unknown>;
    const name = typeof row.name === "string" ? row.name : null;
    if (!name) {
      continue;
    }
    const enabledTools = Array.isArray(row.enabled_tools)
      ? row.enabled_tools.filter((value): value is string => typeof value === "string")
      : Array.isArray(row.enabledTools)
        ? row.enabledTools.filter((value): value is string => typeof value === "string")
        : [];
    const approvalRequiredTools = Array.isArray(row.approval_required_tools)
      ? row.approval_required_tools.filter((value): value is string => typeof value === "string")
      : Array.isArray(row.approvalRequiredTools)
        ? row.approvalRequiredTools.filter((value): value is string => typeof value === "string")
        : [];
    connectors.push({ name, enabledTools, approvalRequiredTools });
  }
  return connectors;
}

export function skillNamesFromCoworker(coworker: CoworkerRecord): string[] {
  const config = coworker.editableConfigJson as Record<string, unknown>;
  const ids = config.skill_version_ids;
  if (!Array.isArray(ids)) {
    return [];
  }
  // P0 stores skill version ids; TrueForge skills require configured names.
  // Only pass through values that already look like skill names (no opaque ids).
  return ids.filter(
    (value): value is string =>
      typeof value === "string" && /^[A-Za-z0-9._-]+$/.test(value) && !value.startsWith("sv_"),
  );
}

export type PersistProvisionedSessionInput = {
  logicalSession: ChannelAgentSessionRecord;
  revision: SessionRevisionRecord;
  generation: ChannelAgentSessionGenerationRecord;
};

export type SessionProvisionStore = Pick<
  WorkspaceCatalogStore,
  "listChannelAgentSessions" | "upsertChannelAgentSession" | "persistProvisionedSession"
>;

export function stableChannelAgentSessionId(channelId: string, coworkerId: string): string {
  return `cas_${channelId}_${coworkerId}`;
}

export async function ensureCoworkerChannelSession(input: {
  store: SessionProvisionStore;
  workspaceId: string;
  channelId: string;
  coworker: CoworkerRecord;
  createdBy: string;
  client?: TrueForgeClient;
  env?: NodeJS.ProcessEnv;
  apiEnv?: ApiEnv;
  sql?: SqlClient;
}): Promise<{
  logicalSession: ChannelAgentSessionRecord;
  revision: CompiledSessionRevision;
  trueforgeSessionId: string;
  generationId: string;
}> {
  const existing = (await input.store.listChannelAgentSessions(input.channelId)).find(
    (row) => row.agentProfileId === input.coworker.id && row.currentGenerationId,
  );
  if (existing?.currentGenerationId) {
    // Already provisioned for this channel/coworker — P0-208 owns rotation.
    return {
      logicalSession: existing,
      revision: {
        id: "existing",
        agentProfileId: input.coworker.id,
        sourceConfigRevision: input.coworker.configRevision,
        effectiveConfigRedacted: {},
        effectiveSpecHash: "",
        approvalPolicyHash: "",
        agentSpec: {
          model: { name: modelPresetFromCoworker(input.coworker) },
          config: {
            sandbox: { enabled: sandboxEnabledFromCoworker(input.coworker) },
            dynamic_sub_agents: { enabled: false },
            generative_ui: { enabled: false },
          },
        },
        createdBy: input.createdBy,
        createdAt: existing.createdAt,
      },
      trueforgeSessionId: "existing",
      generationId: existing.currentGenerationId,
    };
  }

  const now = new Date().toISOString();
  const logicalSessionId = stableChannelAgentSessionId(input.channelId, input.coworker.id);
  const seedRow: ChannelAgentSessionRecord = {
    id: logicalSessionId,
    workspaceId: input.workspaceId,
    channelId: input.channelId,
    agentProfileId: input.coworker.id,
    logicalAguiThreadId: `thread_${input.channelId}_${input.coworker.id}`,
    currentGenerationId: null,
    lastDeliveredChannelSequence: 0,
    state: "active",
    createdAt: now,
    updatedAt: now,
  };
  await input.store.upsertChannelAgentSession(seedRow);
  const afterUpsert = (await input.store.listChannelAgentSessions(input.channelId)).find(
    (row) => row.agentProfileId === input.coworker.id,
  );
  if (!afterUpsert) {
    throw new Error("Failed to upsert channel agent session");
  }
  if (afterUpsert.currentGenerationId) {
    return {
      logicalSession: afterUpsert,
      revision: {
        id: "existing",
        agentProfileId: input.coworker.id,
        sourceConfigRevision: input.coworker.configRevision,
        effectiveConfigRedacted: {},
        effectiveSpecHash: "",
        approvalPolicyHash: "",
        agentSpec: {
          model: { name: modelPresetFromCoworker(input.coworker) },
          config: {
            sandbox: { enabled: sandboxEnabledFromCoworker(input.coworker) },
            dynamic_sub_agents: { enabled: false },
            generative_ui: { enabled: false },
          },
        },
        createdBy: input.createdBy,
        createdAt: afterUpsert.createdAt,
      },
      trueforgeSessionId: "existing",
      generationId: afterUpsert.currentGenerationId,
    };
  }

  const client = input.client ?? loadTrueForgeClientFromEnv(input.env ?? process.env);
  const componentToolNames = input.sql
    ? intersectEffectiveComponentTools(
        await loadControlledComponentCandidates(input.sql, {
          workspaceId: input.workspaceId,
          channelId: input.channelId,
          agentProfileId: input.coworker.id,
        }),
      ).map((row) => row.toolName)
    : [];
  const provisioned = await provisionChannelCoworkerSession(client, {
    channelAgentSessionId: afterUpsert.id,
    generation: 1,
    agentVersionId: input.coworker.currentVersionId,
    coworker: {
      id: input.coworker.id,
      handle: input.coworker.handle,
      name: input.coworker.name,
      title: input.coworker.title,
      configRevision: input.coworker.configRevision,
      standingInstructions: standingInstructionsFromCoworker(input.coworker),
      modelPreset: modelPresetFromCoworker(input.coworker),
      sandboxEnabled: sandboxEnabledFromCoworker(input.coworker),
    },
    channelId: input.channelId,
    workspaceId: input.workspaceId,
    connectors: connectorsFromCoworker(input.coworker),
    skillNames: skillNamesFromCoworker(input.coworker),
    componentToolNames,
    createdBy: input.createdBy,
  });

  const revision: SessionRevisionRecord = {
    id: provisioned.revision.id,
    agentProfileId: provisioned.revision.agentProfileId,
    sourceConfigRevision: provisioned.revision.sourceConfigRevision,
    effectiveConfigRedactedJson: provisioned.revision.effectiveConfigRedacted,
    effectiveSpecHash: provisioned.revision.effectiveSpecHash,
    approvalPolicyHash: provisioned.revision.approvalPolicyHash,
    createdBy: provisioned.revision.createdBy,
    createdAt: provisioned.revision.createdAt,
  };
  const generation: ChannelAgentSessionGenerationRecord = {
    ...provisioned.generation,
    channelAgentSessionId: afterUpsert.id,
    activeTurnId: null,
  };
  const pointed: ChannelAgentSessionRecord = {
    ...afterUpsert,
    currentGenerationId: generation.id,
    updatedAt: now,
  };
  await input.store.persistProvisionedSession({
    logicalSession: pointed,
    revision,
    generation,
  });

  return {
    logicalSession: pointed,
    revision: provisioned.revision,
    trueforgeSessionId: provisioned.trueforgeSession.id,
    generationId: generation.id,
  };
}
