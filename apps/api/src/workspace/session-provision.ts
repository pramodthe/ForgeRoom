import type { CompiledSessionRevision } from "@forgeroom/orchestration/session";
import {
  createSessionGenerationId,
  provisionChannelCoworkerSession,
} from "@forgeroom/orchestration/session";
import { intersectEffectiveComponentTools } from "@forgeroom/orchestration/capability-intersection";
import {
  loadControlledComponentCandidates,
  nextSessionRevisionOrdinal,
  type createSql,
} from "@forgeroom/db";
import { loadTrueForgeClientFromEnv, type TrueForgeClient } from "@forgeroom/trueforge";
import {
  P0_COMPOSIO_APPROVAL_REQUIRED_TOOLS,
  P0_COMPOSIO_ENABLED_TOOLS,
  P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME,
} from "@forgeroom/composio";
import { TASK_RECORD_UPSERT_TOOL_NAME } from "../tasks";
import type { ChannelAgentSessionRecord, CoworkerRecord, WorkspaceCatalogStore } from "./store";
import type { ApiEnv } from "../env";
import {
  registerUiComponentsMcpForGeneration,
  unregisterUiComponentsMcpForGeneration,
} from "../mcp/ui-components-registration";

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
    const configuredToolGrants = Array.isArray(config.tool_grants)
      ? config.tool_grants.filter((value): value is string => typeof value === "string")
      : [];
    if (configuredToolGrants.length === 0) return [];
    const allowed = new Set<string>(P0_COMPOSIO_ENABLED_TOOLS);
    const unknown = configuredToolGrants.find((tool) => !allowed.has(tool));
    if (unknown) {
      throw new Error(`Coworker tool grant is not in the P0 Composio allowlist: ${unknown}`);
    }
    const enabledTools = [...new Set(configuredToolGrants)];
    const approvalRequired = new Set<string>(P0_COMPOSIO_APPROVAL_REQUIRED_TOOLS);
    return [
      {
        name: P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME,
        enabledTools,
        approvalRequiredTools: enabledTools.filter((tool) => approvalRequired.has(tool)),
      },
    ];
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

export function applicationToolNamesFromCoworker(
  coworker: CoworkerRecord,
  channelId: string,
): string[] {
  const config = coworker.editableConfigJson as Record<string, unknown>;
  const grants = config.task_record_grants;
  if (!Array.isArray(grants)) return [];
  const authorized = grants.some((grant) => {
    if (!grant || typeof grant !== "object" || Array.isArray(grant)) return false;
    const row = grant as Record<string, unknown>;
    const operations = Array.isArray(row.operations)
      ? row.operations.filter((value): value is string => typeof value === "string")
      : [];
    return (
      row.channel_id === channelId &&
      operations.includes("create") &&
      operations.includes("update_status")
    );
  });
  return authorized ? [TASK_RECORD_UPSERT_TOOL_NAME] : [];
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

function asIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function createTransactionSessionProvisionStore(sql: SqlClient): SessionProvisionStore {
  return {
    async listChannelAgentSessions(channelId) {
      const rows = await sql<
        Array<{
          id: string;
          workspace_id: string;
          channel_id: string;
          agent_profile_id: string;
          logical_agui_thread_id: string;
          current_generation_id: string | null;
          last_delivered_channel_sequence: number;
          state: ChannelAgentSessionRecord["state"];
          created_at: unknown;
          updated_at: unknown;
        }>
      >`
        SELECT id, workspace_id, channel_id, agent_profile_id, logical_agui_thread_id,
               current_generation_id, last_delivered_channel_sequence, state, created_at, updated_at
        FROM channel_agent_sessions
        WHERE channel_id = ${channelId}
        ORDER BY created_at ASC, id ASC
      `;
      return rows.map((row) => ({
        id: row.id,
        workspaceId: row.workspace_id,
        channelId: row.channel_id,
        agentProfileId: row.agent_profile_id,
        logicalAguiThreadId: row.logical_agui_thread_id,
        currentGenerationId: row.current_generation_id,
        lastDeliveredChannelSequence: row.last_delivered_channel_sequence,
        state: row.state,
        createdAt: asIso(row.created_at),
        updatedAt: asIso(row.updated_at),
      }));
    },
    async upsertChannelAgentSession(session) {
      const updatedAt = session.updatedAt ?? new Date().toISOString();
      await sql`
        INSERT INTO channel_agent_sessions (
          id, workspace_id, channel_id, agent_profile_id, logical_agui_thread_id,
          current_generation_id, last_delivered_channel_sequence, state, created_at, updated_at
        ) VALUES (
          ${session.id}, ${session.workspaceId}, ${session.channelId}, ${session.agentProfileId},
          ${session.logicalAguiThreadId ?? `thread_${session.channelId}_${session.agentProfileId}`},
          ${session.currentGenerationId ?? null}, ${session.lastDeliveredChannelSequence ?? 0},
          ${session.state}, ${session.createdAt ?? updatedAt}, ${updatedAt}
        )
        ON CONFLICT (channel_id, agent_profile_id) DO UPDATE SET
          logical_agui_thread_id = EXCLUDED.logical_agui_thread_id,
          current_generation_id = COALESCE(
            EXCLUDED.current_generation_id,
            channel_agent_sessions.current_generation_id
          ),
          last_delivered_channel_sequence = GREATEST(
            channel_agent_sessions.last_delivered_channel_sequence,
            EXCLUDED.last_delivered_channel_sequence
          ),
          state = EXCLUDED.state,
          updated_at = EXCLUDED.updated_at
      `;
    },
    async persistProvisionedSession(input) {
      await sql`
        INSERT INTO session_revisions (
          id, agent_profile_id, source_config_revision, effective_config_redacted_json,
          effective_spec_hash, approval_policy_hash, created_by, created_at
        ) VALUES (
          ${input.revision.id}, ${input.revision.agentProfileId}, ${input.revision.sourceConfigRevision},
          ${JSON.stringify(input.revision.effectiveConfigRedactedJson)}::jsonb,
          ${input.revision.effectiveSpecHash}, ${input.revision.approvalPolicyHash},
          ${input.revision.createdBy}, ${input.revision.createdAt}
        )
        ON CONFLICT (id) DO NOTHING
      `;
      await sql`
        INSERT INTO channel_agent_session_generations (
          id, channel_agent_session_id, generation, agent_version_id, session_revision_id,
          trueforge_session_id, effective_spec_hash, approval_policy_hash, active_turn_id,
          state, created_at, retired_at
        ) VALUES (
          ${input.generation.id}, ${input.generation.channelAgentSessionId}, ${input.generation.generation},
          ${input.generation.agentVersionId}, ${input.generation.sessionRevisionId},
          ${input.generation.trueforgeSessionId}, ${input.generation.effectiveSpecHash},
          ${input.generation.approvalPolicyHash}, ${input.generation.activeTurnId},
          ${input.generation.state}, ${input.generation.createdAt}, ${input.generation.retiredAt}
        )
      `;
      await sql`
        UPDATE channel_agent_sessions
        SET current_generation_id = ${input.generation.id},
            state = ${input.logicalSession.state},
            updated_at = ${input.logicalSession.updatedAt}
        WHERE id = ${input.logicalSession.id}
      `;
    },
  };
}

export function stableChannelAgentSessionId(channelId: string, coworkerId: string): string {
  return `cas_${channelId}_${coworkerId}`;
}

export function initialSessionGenerationId(logicalSessionId: string): string {
  return createSessionGenerationId(`initial:${logicalSessionId}`);
}

export type EnsureCoworkerChannelSessionInput = {
  store: SessionProvisionStore;
  workspaceId: string;
  channelId: string;
  coworker: CoworkerRecord;
  createdBy: string;
  client?: TrueForgeClient;
  env?: NodeJS.ProcessEnv;
  apiEnv?: ApiEnv;
  sql?: SqlClient;
};

export type EnsuredCoworkerChannelSession = {
  logicalSession: ChannelAgentSessionRecord;
  revision: CompiledSessionRevision;
  trueforgeSessionId: string;
  generationId: string;
};

const localProvisioningTails = new Map<string, Promise<void>>();

async function withLocalProvisioningLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = localProvisioningTails.get(key) ?? Promise.resolve();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => gate);
  localProvisioningTails.set(key, tail);
  await previous;
  try {
    return await run();
  } finally {
    release();
    if (localProvisioningTails.get(key) === tail) {
      localProvisioningTails.delete(key);
    }
  }
}

async function ensureCoworkerChannelSessionUnlocked(
  input: EnsureCoworkerChannelSessionInput,
): Promise<EnsuredCoworkerChannelSession> {
  const initialSessions = await input.store.listChannelAgentSessions(input.channelId);
  const priorLogicalSession = initialSessions.find(
    (row) => row.agentProfileId === input.coworker.id,
  );
  const existing = priorLogicalSession?.currentGenerationId ? priorLogicalSession : undefined;
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
  const recoveryStartedAt =
    priorLogicalSession?.state === "rotating" && !priorLogicalSession.currentGenerationId
      ? priorLogicalSession.updatedAt
      : null;
  const logicalSessionId = stableChannelAgentSessionId(input.channelId, input.coworker.id);
  const seedRow: ChannelAgentSessionRecord = {
    id: logicalSessionId,
    workspaceId: input.workspaceId,
    channelId: input.channelId,
    agentProfileId: input.coworker.id,
    logicalAguiThreadId: `thread_${input.channelId}_${input.coworker.id}`,
    currentGenerationId: priorLogicalSession?.currentGenerationId ?? null,
    lastDeliveredChannelSequence: priorLogicalSession?.lastDeliveredChannelSequence ?? 0,
    state: "rotating",
    createdAt: priorLogicalSession?.createdAt ?? now,
    updatedAt: recoveryStartedAt ?? now,
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
  const applicationToolNames = applicationToolNamesFromCoworker(input.coworker, input.channelId);
  // A stable initial generation makes a connector registered before a crash
  // discoverable and safely replaceable by the next attempt.
  const generationId = initialSessionGenerationId(logicalSessionId);
  const sourceConfigRevision = input.sql
    ? await nextSessionRevisionOrdinal(input.sql, input.coworker.id)
    : input.coworker.configRevision;
  let componentConnectorRegistrationAttempted = false;
  try {
    if (componentToolNames.length + applicationToolNames.length > 0) {
      if (!input.apiEnv) {
        throw new Error("UI components MCP registration requires the API environment");
      }
      componentConnectorRegistrationAttempted = true;
      await registerUiComponentsMcpForGeneration(client, {
        env: input.apiEnv,
        generationId,
        componentToolNames,
        applicationToolNames,
      });
    }

    const provisioned = await provisionChannelCoworkerSession(client, {
      channelAgentSessionId: afterUpsert.id,
      generation: 1,
      generationId,
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
      applicationToolNames,
      sourceConfigRevision,
      ...(recoveryStartedAt
        ? {
            providerReconciliation: {
              operationId: `initial:${logicalSessionId}`,
              startedAt: recoveryStartedAt,
              reconcile: true,
            },
          }
        : {}),
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
      state: "active",
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
  } catch (error) {
    if (componentConnectorRegistrationAttempted) {
      try {
        await unregisterUiComponentsMcpForGeneration(client, { generationId });
      } catch (cleanupError) {
        console.error("ui_components_mcp connector cleanup failed after provisioning error", {
          generationId,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      }
    }
    throw error;
  }
}

export async function ensureCoworkerChannelSession(
  input: EnsureCoworkerChannelSessionInput,
): Promise<EnsuredCoworkerChannelSession> {
  const lockKey = `initial-session:${input.coworker.id}`;
  return withLocalProvisioningLock(lockKey, async () => {
    if (!input.sql) {
      return ensureCoworkerChannelSessionUnlocked(input);
    }
    const markerSessionId = stableChannelAgentSessionId(input.channelId, input.coworker.id);
    const connection = await input.sql.reserve();
    try {
      await connection`
        SELECT pg_advisory_lock(
          ('x' || substr(md5(${lockKey}), 1, 8))::bit(32)::int,
          ('x' || substr(md5(${lockKey}), 9, 8))::bit(32)::int
        )
      `;
      let provisioningError: unknown;
      let unlockError: unknown;
      let provisioned: EnsuredCoworkerChannelSession | undefined;
      try {
        const markerTime = new Date().toISOString();
        // Commit the stable marker on the reserved connection before opening
        // the provisioning transaction. The session-level lock remains held,
        // so its recovery window starts after any lock wait and the marker
        // survives a process crash or transaction rollback.
        await connection`
          INSERT INTO channel_agent_sessions (
            id, workspace_id, channel_id, agent_profile_id, logical_agui_thread_id,
            current_generation_id, last_delivered_channel_sequence, state, created_at, updated_at
          ) VALUES (
            ${markerSessionId}, ${input.workspaceId}, ${input.channelId}, ${input.coworker.id},
            ${`thread_${input.channelId}_${input.coworker.id}`}, NULL, 0, 'rotating',
            ${markerTime}, ${markerTime}
          )
          ON CONFLICT (channel_id, agent_profile_id) DO NOTHING
        `;
        const transactionSql = connection as unknown as SqlClient;
        await connection`BEGIN`;
        try {
          const result = await ensureCoworkerChannelSessionUnlocked({
            ...input,
            sql: transactionSql,
            store: createTransactionSessionProvisionStore(transactionSql),
          });
          await connection`COMMIT`;
          provisioned = result;
        } catch (error) {
          try {
            await connection`ROLLBACK`;
          } catch (rollbackError) {
            console.error("initial session provisioning rollback failed", {
              channelId: input.channelId,
              coworkerId: input.coworker.id,
              error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
            });
          }
          throw error;
        }
      } catch (error) {
        provisioningError = error;
        throw error;
      } finally {
        try {
          await connection`
            SELECT pg_advisory_unlock(
              ('x' || substr(md5(${lockKey}), 1, 8))::bit(32)::int,
              ('x' || substr(md5(${lockKey}), 9, 8))::bit(32)::int
            )
          `;
        } catch (error) {
          if (!provisioningError) {
            unlockError = error;
          } else {
            console.error("initial session provisioning advisory unlock failed", {
              channelId: input.channelId,
              coworkerId: input.coworker.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
      if (unlockError) {
        throw unlockError;
      }
      if (!provisioned) {
        throw new Error("Initial session provisioning completed without a result");
      }
      return provisioned;
    } finally {
      connection.release();
    }
  });
}
