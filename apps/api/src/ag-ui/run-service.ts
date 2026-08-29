import { createHash } from "node:crypto";
import {
  buildAgUiCoworkerCapabilities,
  extractExistingRunBinding,
  extractLatestUserMessageContent,
  formatAgUiSseEvent,
  parseUpstreamRunAgentInput,
  pollTrueForgeTurnEvents,
  TrueForgeAGUIAdapter,
  toPersistedAgUiEvent,
} from "@forgeroom/ag-ui";
import { actingIdentitySchema, type SessionResponse } from "@forgeroom/contracts";
import {
  requireToolPolicy,
  type ComposioSessionClient,
  verifyP0ManifestForDispatch,
} from "@forgeroom/composio";
import { extractDiscoveredSandboxArtifacts } from "@forgeroom/artifacts";
import {
  claimPauseGroupResume,
  completePauseResume,
  derivePausePayloadKey,
  findPauseGroupByInterruptIds,
  ingestNormalizedTrueForgeEvent,
  loadPauseGroupResumeGate,
  loadPauseResumeForCreate,
  markPauseResumeCreating,
  markPauseResumeUncertain,
  persistPauseGroupCapture,
  type createSql,
} from "@forgeroom/db";
import {
  authorizeAgUiPauseGroupResume,
  buildApprovalRedactionResult,
  buildPauseGroupCapturePlan,
  evaluateTurnDoneOutcome,
  extractRawRequiredActions,
  normalizeTrueForgeEvent,
  publishSandboxArtifactFromDiscovery,
} from "@forgeroom/orchestration";
import { createOrReconcileResponseTurn } from "@forgeroom/orchestration/create-or-reconcile-response-turn";
import type { TrueForgeClient } from "@forgeroom/trueforge";
import { mapTrueForgeWireEventsToSandboxLifecycle } from "@forgeroom/trueforge";
import type { ArtifactService } from "../artifacts/service";
import type { WorkspaceService } from "../workspace/service";
import { bindDurableTrueForgeTurn } from "./bind-durable-turn";

type PauseCaptureBindingRow = {
  generation: number;
  approval_policy_hash: string;
  trueforge_session_id: string;
  generation_state: string;
  current_generation_id: string | null;
  session_generation_id: string;
  workspace_id: string;
  channel_id: string;
  agent_profile_id: string;
  effective_config_redacted_json: Record<string, unknown>;
  connector_binding_id: string;
  trueforge_connector_name: string;
  allowed_tools_json: unknown;
  acting_identity_json: unknown;
  connector_status: string;
  tool_name: string;
  classification: string;
  approval_policy: string;
  observed_descriptor_hash: string;
};

function configuredConnectorAllowsTool(
  config: Record<string, unknown>,
  connectorName: string,
  toolName: string,
): boolean {
  const connectors = Array.isArray(config.connectors) ? config.connectors : [];
  return connectors.some((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const connector = item as Record<string, unknown>;
    const enabledTools = Array.isArray(connector.enabled_tools) ? connector.enabled_tools : [];
    const approvalTools = Array.isArray(connector.approval_required_tools)
      ? connector.approval_required_tools
      : [];
    return (
      connector.name === connectorName &&
      enabledTools.includes(toolName) &&
      approvalTools.includes(toolName)
    );
  });
}

/**
 * Capture raw provider required-actions before normalization removes arguments and identifiers.
 * Every approval is rebound to the immutable session generation plus the live, reviewed
 * Composio grant/connector/identity; model-authored summaries are never trusted.
 */
export async function captureTrueForgeRequiredActions(input: {
  sql: ReturnType<typeof createSql>;
  bootstrap: AgUiRunBootstrap;
  raw: Record<string, unknown>;
  rawEvents?: Array<Record<string, unknown>>;
}): Promise<{ ok: true; inserted: boolean } | { ok: false; reason: string }> {
  const requiredActions = resolveTrueForgeRequiredActions(
    extractRawRequiredActions(input.raw),
    input.rawEvents ?? [input.raw],
  );
  if (requiredActions.length === 0) {
    return { ok: true, inserted: false };
  }

  const approvalToolNames = [
    ...new Set(
      requiredActions.flatMap((action) => {
        const type = typeof action.type === "string" ? action.type.toLowerCase() : "";
        if (!type.includes("approval")) return [];
        const toolName = action.tool_name ?? action.toolName ?? action.name ?? action.tool;
        return typeof toolName === "string" && toolName.length > 0 ? [toolName] : [];
      }),
    ),
  ];

  const rows = await input.sql<PauseCaptureBindingRow[]>`
    SELECT
      gen.generation,
      gen.approval_policy_hash,
      gen.trueforge_session_id,
      gen.state AS generation_state,
      cas.current_generation_id,
      turn.session_generation_id,
      cas.workspace_id,
      cas.channel_id,
      cas.agent_profile_id,
      sr.effective_config_redacted_json,
      tg.connector_binding_id,
      cb.trueforge_connector_name,
      cb.allowed_tools_json,
      cb.acting_identity_json,
      cb.status AS connector_status,
      tg.tool_name,
      tg.classification,
      tg.approval_policy,
      tg.observed_descriptor_hash
    FROM agent_turns AS turn
    JOIN channel_agent_session_generations AS gen ON gen.id = turn.session_generation_id
    JOIN channel_agent_sessions AS cas ON cas.id = turn.channel_agent_session_id
    JOIN session_revisions AS sr ON sr.id = gen.session_revision_id
    JOIN tool_grants AS tg
      ON tg.workspace_id = cas.workspace_id
      AND tg.channel_id = cas.channel_id
      AND tg.agent_profile_id = cas.agent_profile_id
      AND tg.revoked_at IS NULL
    JOIN connector_bindings AS cb
      ON cb.id = tg.connector_binding_id
      AND cb.workspace_id = cas.workspace_id
    WHERE turn.id = ${input.bootstrap.agentTurnId}
      AND turn.trueforge_turn_id = ${input.bootstrap.trueforgeTurnId}
      AND tg.tool_name IN ${input.sql(approvalToolNames.length > 0 ? approvalToolNames : ["__none__"])}
  `;

  const byTool = new Map(rows.map((row) => [row.tool_name, row]));
  let connectorBindingId = "not_applicable";
  let actingIdentityJson: Record<string, unknown> = {};
  let generation: number | null = null;
  let approvalPolicyHash: string | null = null;

  const reviewed = new Map<string, ReturnType<typeof requireToolPolicy>>();
  for (const toolName of approvalToolNames) {
    let policy: ReturnType<typeof requireToolPolicy>;
    try {
      policy = requireToolPolicy(toolName);
    } catch {
      return { ok: false, reason: `unreviewed_approval_tool:${toolName}` };
    }
    const row = byTool.get(toolName);
    if (!row) return { ok: false, reason: `missing_live_tool_binding:${toolName}` };
    const allowedTools = Array.isArray(row.allowed_tools_json) ? row.allowed_tools_json : [];
    const effectiveConfig = row.effective_config_redacted_json ?? {};
    const classification = policy.riskClass === "read" ? "read" : "write";
    const identity = actingIdentitySchema.safeParse(row.acting_identity_json);
    if (
      row.generation_state !== "ready" ||
      row.current_generation_id !== row.session_generation_id ||
      row.trueforge_session_id !== input.bootstrap.trueforgeSessionId ||
      row.channel_id !== input.bootstrap.channelId ||
      row.agent_profile_id !== input.bootstrap.coworkerId ||
      row.connector_status !== "active" ||
      !allowedTools.includes(toolName) ||
      !configuredConnectorAllowsTool(effectiveConfig, row.trueforge_connector_name, toolName) ||
      row.classification !== classification ||
      row.approval_policy !== "required" ||
      row.observed_descriptor_hash !== policy.observedDescriptorHash ||
      !identity.success
    ) {
      return { ok: false, reason: `invalid_live_tool_binding:${toolName}` };
    }
    if (
      connectorBindingId !== "not_applicable" &&
      connectorBindingId !== row.connector_binding_id
    ) {
      return { ok: false, reason: "mixed_connector_bindings" };
    }
    if (generation !== null && generation !== row.generation) {
      return { ok: false, reason: "mixed_session_generations" };
    }
    connectorBindingId = row.connector_binding_id;
    actingIdentityJson = identity.data;
    generation = row.generation;
    approvalPolicyHash = row.approval_policy_hash;
    reviewed.set(toolName, policy);
  }

  if (generation === null || approvalPolicyHash === null) {
    const base = await input.sql<
      Array<{
        generation: number;
        approval_policy_hash: string;
        trueforge_session_id: string;
        generation_state: string;
        current_generation_id: string | null;
        session_generation_id: string;
        channel_id: string;
        agent_profile_id: string;
      }>
    >`
      SELECT
        gen.generation, gen.approval_policy_hash, gen.trueforge_session_id,
        gen.state AS generation_state, cas.current_generation_id,
        turn.session_generation_id, cas.channel_id, cas.agent_profile_id
      FROM agent_turns AS turn
      JOIN channel_agent_session_generations AS gen ON gen.id = turn.session_generation_id
      JOIN channel_agent_sessions AS cas ON cas.id = turn.channel_agent_session_id
      WHERE turn.id = ${input.bootstrap.agentTurnId}
        AND turn.trueforge_turn_id = ${input.bootstrap.trueforgeTurnId}
      LIMIT 1
    `;
    const row = base[0];
    if (
      !row ||
      row.generation_state !== "ready" ||
      row.current_generation_id !== row.session_generation_id ||
      row.trueforge_session_id !== input.bootstrap.trueforgeSessionId ||
      row.channel_id !== input.bootstrap.channelId ||
      row.agent_profile_id !== input.bootstrap.coworkerId
    ) {
      return { ok: false, reason: "invalid_session_generation_binding" };
    }
    generation = row.generation;
    approvalPolicyHash = row.approval_policy_hash;
  }

  const plan = buildPauseGroupCapturePlan({
    trueforgeTurnId: input.bootstrap.trueforgeTurnId,
    generation,
    requiredActions,
    persistentThreadId: input.bootstrap.threadId,
    approvalRedaction: {
      redactApproval(toolName, args) {
        const policy = reviewed.get(toolName);
        if (!policy) throw new Error(`unreviewed approval tool: ${toolName}`);
        const preview = policy.renderPreview(args);
        return buildApprovalRedactionResult({
          observedDescriptorHash: policy.observedDescriptorHash,
          riskClass: policy.riskClass,
          redactedArguments: { ...preview.redactedArguments },
          redactedTarget: { ...preview.target },
          expectedEffect: preview.expectedEffect,
        });
      },
    },
  });
  if ("ok" in plan) {
    return { ok: false, reason: plan.reason };
  }
  const persisted = await persistPauseGroupCapture(input.sql, {
    agentTurnId: input.bootstrap.agentTurnId,
    trueforgeTurnId: input.bootstrap.trueforgeTurnId,
    generation: plan.generation,
    actions: plan.actions,
    runStepState: plan.runStepState,
    connectorBindingId,
    actingIdentityJson,
    approvalPolicyHash,
  });
  return persisted.ok
    ? { ok: true, inserted: persisted.inserted }
    : { ok: false, reason: persisted.reason };
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseToolArguments(value: unknown): unknown {
  if (typeof value !== "string") return value ?? {};
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
}

/**
 * TrueForge groups approvals as tool-call references. Rebind every reference to
 * the immutable model.message that declared its tool name and arguments before
 * the generic PauseGroup capture path performs policy redaction.
 */
export function resolveTrueForgeRequiredActions(
  requiredActions: Array<Record<string, unknown>>,
  rawEvents: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const sourceEvents = new Map(
    rawEvents
      .filter((event) => readNonEmptyString(event.id))
      .map((event) => [readNonEmptyString(event.id)!, event]),
  );
  return requiredActions.flatMap((action) => {
    const type = readNonEmptyString(action.type)?.toLowerCase() ?? "";
    const refs = Array.isArray(action.tool_calls)
      ? action.tool_calls
      : Array.isArray(action.toolCalls)
        ? action.toolCalls
        : null;
    if (!type.includes("approval") || !refs || refs.length === 0) return [action];

    return refs.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [action];
      const ref = item as Record<string, unknown>;
      const toolCallId = readNonEmptyString(ref.id);
      const sourceEventId =
        readNonEmptyString(ref.source_event_id) ?? readNonEmptyString(ref.sourceEventId);
      const source = sourceEventId ? sourceEvents.get(sourceEventId) : null;
      const calls = source && Array.isArray(source.tool_calls) ? source.tool_calls : [];
      const call = calls.find(
        (candidate) =>
          candidate &&
          typeof candidate === "object" &&
          !Array.isArray(candidate) &&
          readNonEmptyString((candidate as Record<string, unknown>).id) === toolCallId,
      ) as Record<string, unknown> | undefined;
      const fn =
        call?.function && typeof call.function === "object" && !Array.isArray(call.function)
          ? (call.function as Record<string, unknown>)
          : null;
      const toolInfo =
        call?.tool_info && typeof call.tool_info === "object" && !Array.isArray(call.tool_info)
          ? (call.tool_info as Record<string, unknown>)
          : null;
      const toolName =
        readNonEmptyString(fn?.name) ??
        readNonEmptyString(toolInfo?.name) ??
        readNonEmptyString(call?.name);
      if (!toolCallId || !sourceEventId || !source || !call || !toolName) {
        return [
          {
            ...action,
            id: toolCallId ?? action.id,
            tool_call_id: toolCallId ?? undefined,
          },
        ];
      }
      return [
        {
          type: "tool.approval_required",
          id: toolCallId,
          tool_call_id: toolCallId,
          tool_name: toolName,
          arguments: parseToolArguments(fn?.arguments ?? call.arguments),
          thread_id: action.thread_id ?? action.threadId ?? source.thread_id ?? source.threadId,
        },
      ];
    });
  });
}

function stableArtifactId(input: {
  trueforgeTurnId: string;
  sandboxId: string;
  sandboxPath: string;
}): string {
  const preimage = `${input.trueforgeTurnId}\0${input.sandboxId}\0${input.sandboxPath}`;
  // Opaque and restart-stable: replaying provider history addresses the same artifact.
  return `artifact_${createHash("sha256").update(preimage).digest("hex").slice(0, 32)}`;
}

/**
 * Project sandbox lifecycle from buffered raw events and publish every completed, declared file.
 * Raw tool responses and file bytes never enter RunEvent JSON; only reviewed projections do.
 */
export async function persistAgUiSandboxArtifacts(input: {
  sql: ReturnType<typeof createSql>;
  bootstrap: AgUiRunBootstrap;
  rawEvents: Array<Record<string, unknown>>;
  trueforgeClient: Pick<TrueForgeClient, "downloadSandboxFile">;
  artifacts: Pick<ArtifactService, "publishArtifact">;
}): Promise<{ discovered: number; published: number }> {
  const lifecycle = mapTrueForgeWireEventsToSandboxLifecycle(input.rawEvents);
  for (const event of lifecycle) {
    const ingested = await ingestNormalizedTrueForgeEvent(input.sql, {
      agentTurnId: input.bootstrap.agentTurnId,
      expectedTurnStates: ["creating", "streaming", "required_actions", "completed"],
      event: {
        trueforgeEventId: event.trueforgeEventId,
        normalizedType: event.applicationType,
        threadId: input.bootstrap.threadId,
        sequenceNumber: null,
        payloadRedacted: event.payloadRedacted,
      },
    });
    if (!ingested.ok) throw new Error("Sandbox lifecycle projection failed");
  }

  const completedSandboxes = new Set(
    lifecycle.filter((event) => event.commandState === "completed").map((event) => event.sandboxId),
  );
  const discoveries = extractDiscoveredSandboxArtifacts(input.rawEvents);
  let published = 0;
  for (const discovery of discoveries) {
    const artifactId = stableArtifactId({
      trueforgeTurnId: input.bootstrap.trueforgeTurnId,
      sandboxId: discovery.sandboxId,
      sandboxPath: discovery.sandboxPath,
    });
    const result = await publishSandboxArtifactFromDiscovery(
      {
        downloadSandboxFile: async ({ sessionId, turnId, sandboxPath }) =>
          Buffer.from(
            await input.trueforgeClient.downloadSandboxFile(sessionId, turnId, sandboxPath),
          ),
        publishArtifact: async (artifact) => {
          const persisted = await input.artifacts.publishArtifact(artifact);
          return persisted.ok
            ? {
                ok: true,
                created: persisted.value.created,
                sha256: persisted.value.artifact.sha256,
                byteSize: persisted.value.artifact.byte_size,
              }
            : { ok: false, reason: persisted.error.code };
        },
      },
      {
        workspaceId: await (async () => {
          const rows = await input.sql<Array<{ workspace_id: string }>>`
            SELECT workspace_id FROM channel_agent_sessions
            WHERE channel_id = ${input.bootstrap.channelId}
              AND agent_profile_id = ${input.bootstrap.coworkerId}
            LIMIT 1
          `;
          if (!rows[0]) throw new Error("Artifact workspace binding not found");
          return rows[0].workspace_id;
        })(),
        channelId: input.bootstrap.channelId,
        runId: input.bootstrap.applicationRunId,
        runStepId: input.bootstrap.runStepId,
        creatorAgentId: input.bootstrap.coworkerId,
        trueforgeSessionId: input.bootstrap.trueforgeSessionId,
        trueforgeTurnId: input.bootstrap.trueforgeTurnId,
        artifactId,
        revision: 1,
        discovery,
        sandboxCommandState: completedSandboxes.has(discovery.sandboxId) ? "completed" : "running",
      },
    );
    for (const [index, event] of result.events.entries()) {
      const ingested = await ingestNormalizedTrueForgeEvent(input.sql, {
        agentTurnId: input.bootstrap.agentTurnId,
        expectedTurnStates: ["creating", "streaming", "required_actions", "completed"],
        event: {
          trueforgeEventId: `${discovery.trueforgeEventId}:${event.normalizedType}:${index}`,
          normalizedType: event.normalizedType,
          threadId: input.bootstrap.threadId,
          sequenceNumber: null,
          payloadRedacted: event.payloadRedacted,
        },
      });
      if (!ingested.ok) throw new Error("Artifact lifecycle projection failed");
    }
    if (result.ok) published += 1;
  }
  return { discovered: discoveries.length, published };
}

export type AgUiRunServiceError = {
  code:
    | "not_found"
    | "forbidden"
    | "validation_failed"
    | "recipient_unavailable"
    | "provider_unavailable"
    | "conflict";
  message: string;
  details?: Record<string, unknown>;
};

export type AgUiRunBootstrap = {
  threadId: string;
  aguiRunId: string;
  applicationRunId: string;
  runStepId: string;
  agentTurnId: string;
  messageId: string;
  channelId: string;
  coworkerId: string;
  trueforgeSessionId: string;
  trueforgeTurnId: string;
};

/** Persist a redacted retry marker while keeping artifact failure secondary to approvals. */
export async function recordAgUiArtifactProjectionFailure(input: {
  sql: ReturnType<typeof createSql>;
  bootstrap: AgUiRunBootstrap;
  terminalEventId: string | null;
}): Promise<void> {
  const eventId = input.terminalEventId ?? `${input.bootstrap.trueforgeTurnId}:turn.done`;
  console.error("AG-UI sandbox artifact projection failed", {
    agentTurnId: input.bootstrap.agentTurnId,
    trueforgeTurnId: input.bootstrap.trueforgeTurnId,
  });
  try {
    const ingested = await ingestNormalizedTrueForgeEvent(input.sql, {
      agentTurnId: input.bootstrap.agentTurnId,
      expectedTurnStates: ["creating", "streaming", "required_actions", "completed"],
      event: {
        trueforgeEventId: `${eventId}:artifact_projection_failed`,
        normalizedType: "artifact.publication_failed",
        threadId: input.bootstrap.threadId,
        sequenceNumber: null,
        payloadRedacted: {
          reason: "artifact_projection_failed",
          retryable: true,
        },
      },
    });
    if (!ingested.ok) {
      console.error("AG-UI artifact failure marker could not be persisted", {
        agentTurnId: input.bootstrap.agentTurnId,
      });
    }
  } catch {
    console.error("AG-UI artifact failure marker could not be persisted", {
      agentTurnId: input.bootstrap.agentTurnId,
    });
  }
}

export type AgUiRunService = {
  getCapabilities(
    session: SessionResponse,
    channelId: string,
    coworkerId: string,
  ): Promise<
    | { ok: true; value: ReturnType<typeof buildAgUiCoworkerCapabilities> }
    | { ok: false; error: AgUiRunServiceError }
  >;
  prepareRun(
    session: SessionResponse,
    channelId: string,
    coworkerId: string,
    body: unknown,
  ): Promise<{ ok: true; value: AgUiRunBootstrap } | { ok: false; error: AgUiRunServiceError }>;
  streamPreparedRun(
    bootstrap: AgUiRunBootstrap,
    write: (chunk: string) => Promise<void>,
    options?: { isDeliveryAuthorized?: () => Promise<boolean> },
  ): Promise<void>;
};

export function createAgUiRunService(options: {
  workspace: WorkspaceService;
  trueforgeClient?: TrueForgeClient;
  composio?: ComposioSessionClient;
  sql?: ReturnType<typeof createSql>;
  artifacts?: Pick<ArtifactService, "publishArtifact">;
  pausePayloadEncryptionSecret?: string;
}): AgUiRunService {
  const { workspace, trueforgeClient, sql, composio, artifacts } = options;
  const encryptionKey = derivePausePayloadKey(
    options.pausePayloadEncryptionSecret ?? "forgeroom-dev-pause-payload-secret",
  );

  return {
    async getCapabilities(session, channelId, coworkerId) {
      const resolved = await workspace.resolveAgUiCoworkerContext(session, channelId, coworkerId);
      if (!resolved.ok) {
        return {
          ok: false,
          error: {
            code: resolved.error.code as AgUiRunServiceError["code"],
            message: resolved.error.message,
            details:
              "details" in resolved.error
                ? (resolved.error.details as Record<string, unknown>)
                : undefined,
          },
        };
      }
      return {
        ok: true,
        value: buildAgUiCoworkerCapabilities({
          channelId,
          coworkerId,
          logicalThreadId: resolved.value.logicalThreadId,
        }),
      };
    },

    async prepareRun(session, channelId, coworkerId, body) {
      const parsedInput = parseUpstreamRunAgentInput(body);
      if (!parsedInput.ok) {
        return {
          ok: false,
          error: {
            code: "validation_failed",
            message:
              parsedInput.reason === "unsupported_in_p0"
                ? "Unsupported RunAgentInput capability."
                : "Invalid RunAgentInput.",
            details: {
              capability: parsedInput.capability,
              reason: parsedInput.reason,
              issues: parsedInput.issues,
            },
          },
        };
      }

      const resolved = await workspace.resolveAgUiCoworkerContext(session, channelId, coworkerId);
      if (!resolved.ok) {
        return {
          ok: false,
          error: {
            code: resolved.error.code as AgUiRunServiceError["code"],
            message: resolved.error.message,
            details:
              "details" in resolved.error
                ? (resolved.error.details as Record<string, unknown>)
                : undefined,
          },
        };
      }

      const input = parsedInput.input;
      if (input.threadId !== resolved.value.logicalThreadId) {
        return {
          ok: false,
          error: {
            code: "validation_failed",
            message: "threadId must match the server-issued logical coworker thread ID.",
            details: {
              expected_thread_id: resolved.value.logicalThreadId,
              received_thread_id: input.threadId,
            },
          },
        };
      }

      if (parsedInput.resumeRequiresPauseGroupService) {
        if (!sql) {
          return {
            ok: false,
            error: {
              code: "validation_failed",
              message: "RunAgentInput.resume requires PauseGroup service authorization.",
              details: { reason: "pause_group_service_unavailable" },
            },
          };
        }
        const resumeItems = (input.resume ?? []).map((item) => ({
          interruptId: item.interruptId,
          status: item.status as "resolved" | "cancelled" | undefined,
          payload: "payload" in item ? item.payload : undefined,
        }));
        const located = await findPauseGroupByInterruptIds(sql, {
          workspaceId: session.workspace_id,
          interruptIds: resumeItems.map((item) => item.interruptId),
        });
        if (!located.ok) {
          return {
            ok: false,
            error: {
              code: "validation_failed",
              message: "RunAgentInput.resume interrupt IDs do not map to one PauseGroup.",
              details: { reason: located.reason },
            },
          };
        }
        const gate = await loadPauseGroupResumeGate(sql, {
          pauseGroupId: located.pauseGroupId,
          workspaceId: session.workspace_id,
        });
        if (!gate.ok) {
          return {
            ok: false,
            error: {
              code: gate.reason === "forbidden" ? "forbidden" : "not_found",
              message: "PauseGroup not found for resume.",
            },
          };
        }
        const routeMatchesPauseGroup =
          gate.channelId === channelId &&
          gate.channelAgentSessionId === resolved.value.channelAgentSessionId &&
          gate.coworkerId === coworkerId &&
          gate.logicalThreadId === resolved.value.logicalThreadId;
        if (!routeMatchesPauseGroup) {
          return {
            ok: false,
            error: {
              code: "validation_failed",
              message: "RunAgentInput.resume does not match the PauseGroup route binding.",
              details: { reason: "pause_group_route_binding_mismatch" },
            },
          };
        }
        const authorized = authorizeAgUiPauseGroupResume({
          resume: resumeItems,
          actionAliases: gate.actions,
          requiredActionCount: gate.requiredActionCount,
          pauseGroupReady:
            gate.state === "ready" || gate.state === "resuming" || gate.state === "uncertain",
          pauseGroupExpired: gate.expired,
        });
        if (!authorized.ok) {
          return {
            ok: false,
            error: {
              code: "validation_failed",
              message: "RunAgentInput.resume rejected by PauseGroup service.",
              details: { reason: authorized.reason },
            },
          };
        }
        if (!trueforgeClient) {
          return {
            ok: false,
            error: {
              code: "provider_unavailable",
              message: "TrueForge runtime is required for PauseGroup resume create.",
            },
          };
        }

        let claim = await claimPauseGroupResume(sql, {
          pauseGroupId: located.pauseGroupId,
          workspaceId: session.workspace_id,
          workerId: `agui_${session.user.id}`,
          encryptionKey,
          expectedBinding: {
            channelId,
            channelAgentSessionId: gate.channelAgentSessionId,
            coworkerId,
            logicalThreadId: resolved.value.logicalThreadId,
          },
        });
        if (!claim.ok && claim.reason === "already_resuming" && claim.existingPauseResumeId) {
          const existing = await loadPauseResumeForCreate(sql, {
            pauseResumeId: claim.existingPauseResumeId,
            encryptionKey,
          });
          if (!existing.ok) {
            await markPauseResumeUncertain(sql, {
              pauseResumeId: claim.existingPauseResumeId,
              error: { reason: "decrypt_failed" },
            });
            return {
              ok: false,
              error: {
                code: "provider_unavailable",
                message: "Encrypted PauseResume payload could not be opened.",
              },
            };
          }
          claim = {
            ok: true,
            inserted: false,
            pauseResumeId: existing.pauseResumeId,
            pauseGroupId: existing.pauseGroupId,
            applicationRunToken: existing.applicationRunToken,
            responsePayloadHash: existing.responsePayloadHash,
            resumeClaimToken: "existing",
            queueItemId: "existing",
            agentTurnId: existing.agentTurnId,
            previousTrueforgeTurnId: existing.previousTrueforgeTurnId,
            trueforgeSessionId: existing.trueforgeSessionId,
            channelId: gate.channelId,
            channelAgentSessionId: gate.channelAgentSessionId,
            coworkerId: gate.coworkerId,
            logicalThreadId: gate.logicalThreadId,
            requiredActionIds: gate.requiredActionIds,
          };
        }
        if (!claim.ok) {
          return {
            ok: false,
            error: {
              code: claim.reason === "incomplete" ? "validation_failed" : "conflict",
              message: "PauseGroup cannot be resumed yet.",
              details: { reason: claim.reason },
            },
          };
        }

        const loaded = await loadPauseResumeForCreate(sql, {
          pauseResumeId: claim.pauseResumeId,
          encryptionKey,
        });
        if (!loaded.ok) {
          await markPauseResumeUncertain(sql, {
            pauseResumeId: claim.pauseResumeId,
            error: { reason: "decrypt_failed" },
          });
          return {
            ok: false,
            error: {
              code: "provider_unavailable",
              message: "Encrypted PauseResume payload could not be opened.",
            },
          };
        }

        const creating = await markPauseResumeCreating(sql, { pauseResumeId: claim.pauseResumeId });
        if (!creating.ok) {
          return {
            ok: false,
            error: {
              code: "conflict",
              message: "PauseResume is already being created by another worker.",
            },
          };
        }
        const created = await createOrReconcileResponseTurn(
          {
            client: trueforgeClient,
            lockForCreate: async () => ({ ok: true }),
            bindResumeTurn: async () => {
              // Completion happens after create/reconcile returns so we know created vs reconciled.
            },
            markUncertain: async ({ pauseResumeId, error }) => {
              await markPauseResumeUncertain(sql, { pauseResumeId, error });
            },
          },
          {
            pauseResumeId: claim.pauseResumeId,
            trueforgeSessionId: claim.trueforgeSessionId,
            applicationRunToken: claim.applicationRunToken,
            previousTrueforgeTurnId: claim.previousTrueforgeTurnId,
            responses: loaded.plaintext.responses,
            localTrueforgeResumeTurnId: loaded.trueforgeResumeTurnId,
            forceReconcile: !loaded.trueforgeResumeTurnId || loaded.state === "uncertain",
          },
        );

        if (!created.ok) {
          return {
            ok: false,
            error: {
              code: "provider_unavailable",
              message: "Response-only TrueForge resume create/reconcile failed.",
              details: { reason: created.reason },
            },
          };
        }

        const completed = await completePauseResume(sql, {
          pauseResumeId: claim.pauseResumeId,
          trueforgeResumeTurnId: created.trueforgeTurnId,
          reconciled: !created.created,
        });
        if (!completed.ok) {
          await markPauseResumeUncertain(sql, {
            pauseResumeId: claim.pauseResumeId,
            error: { reason: "complete_cas_failed" },
          });
          return {
            ok: false,
            error: {
              code: "conflict",
              message: "PauseResume completion CAS failed after provider turn succeeded.",
            },
          };
        }

        return {
          ok: true,
          value: {
            threadId: resolved.value.logicalThreadId,
            aguiRunId: input.runId,
            applicationRunId: `resume_${claim.pauseResumeId}`,
            runStepId: `resume_step_${claim.pauseResumeId}`,
            agentTurnId: claim.agentTurnId,
            messageId: `resume_msg_${claim.pauseResumeId}`,
            channelId,
            coworkerId,
            trueforgeSessionId: claim.trueforgeSessionId,
            trueforgeTurnId: created.trueforgeTurnId,
          },
        };
      }

      const content = extractLatestUserMessageContent(input);
      if (!content) {
        return {
          ok: false,
          error: {
            code: "validation_failed",
            message: "RunAgentInput must include at least one non-empty user message.",
          },
        };
      }

      if (resolved.value.availability !== "available") {
        return {
          ok: false,
          error: {
            code: "recipient_unavailable",
            message: "Coworker is not available for a new AG-UI run.",
            details: { availability: resolved.value.availability },
          },
        };
      }

      if (!trueforgeClient || !sql || !resolved.value.trueforgeSessionId) {
        return {
          ok: false,
          error: {
            code: "provider_unavailable",
            message: "TrueForge runtime and SQL are required for AG-UI runs.",
          },
        };
      }

      const existingBinding = extractExistingRunBinding(input);
      if (existingBinding) {
        const rows = await sql<
          {
            application_run_id: string;
            source_message_id: string;
            channel_id: string;
            message_body: string;
            run_step_id: string;
            assigned_agent_id: string;
            logical_agui_thread_id: string;
          }[]
        >`
          SELECT
            r.id AS application_run_id,
            r.source_message_id,
            m.channel_id,
            m.body AS message_body,
            rs.id AS run_step_id,
            rs.assigned_agent_id,
            cas.logical_agui_thread_id
          FROM runs r
          JOIN messages m ON m.id = r.source_message_id
          JOIN run_steps rs ON rs.run_id = r.id
          JOIN turn_queue_items tqi ON tqi.run_step_id = rs.id
          JOIN channel_agent_sessions cas ON cas.id = tqi.channel_agent_session_id
          WHERE r.id = ${existingBinding.applicationRunId}
            AND r.source_message_id = ${existingBinding.sourceMessageId}
            AND rs.id = ${existingBinding.runStepId}
          LIMIT 1
        `;
        const existing = rows[0];
        if (
          !existing ||
          existing.channel_id !== channelId ||
          existing.assigned_agent_id !== coworkerId ||
          existing.logical_agui_thread_id !== input.threadId ||
          existing.message_body !== content
        ) {
          return {
            ok: false,
            error: {
              code: "validation_failed",
              message: "Existing ForgeRoom run binding does not match this channel turn.",
            },
          };
        }

        const bound = await bindDurableTrueForgeTurn({
          sql,
          trueforgeClient,
          runStepId: existing.run_step_id,
          content,
          clientAguiRunId: input.runId,
        });
        if (!bound.ok) {
          return {
            ok: false,
            error: {
              code: "provider_unavailable",
              message: "Could not bind a durable TrueForge turn for the existing AG-UI run.",
              details: { reason: bound.reason },
            },
          };
        }

        return {
          ok: true,
          value: {
            threadId: resolved.value.logicalThreadId,
            aguiRunId: bound.value.aguiRunId,
            applicationRunId: existing.application_run_id,
            runStepId: existing.run_step_id,
            agentTurnId: bound.value.agentTurnId,
            messageId: existing.source_message_id,
            channelId,
            coworkerId,
            trueforgeSessionId: bound.value.trueforgeSessionId,
            trueforgeTurnId: bound.value.trueforgeTurnId,
          },
        };
      }

      if (!composio) {
        return {
          ok: false,
          error: {
            code: "provider_unavailable",
            message: "Composio connector configuration is required for AG-UI dispatch preflight.",
          },
        };
      }

      try {
        const preflight = await verifyP0ManifestForDispatch(composio);
        if (preflight.blocksDispatch) {
          return {
            ok: false,
            error: {
              code: "recipient_unavailable",
              message: "Coworker dispatch blocked by connector manifest preflight.",
              details: { preflight: preflight.redacted },
            },
          };
        }
      } catch {
        return {
          ok: false,
          error: {
            code: "provider_unavailable",
            message: "Connector manifest preflight could not be completed.",
          },
        };
      }

      const posted = await workspace.postMessage(session, channelId, {
        body: `@${resolved.value.coworker.handle} ${content}`,
        recipient_handles: [],
        routing_mode: "direct",
        parent_message_id: null,
        idempotency_key: `agui:${channelId}:${coworkerId}:${input.runId}`,
      });
      if (!posted.ok) {
        return {
          ok: false,
          error: {
            code: posted.error.code as AgUiRunServiceError["code"],
            message: posted.error.message,
            details:
              "details" in posted.error
                ? (posted.error.details as Record<string, unknown>)
                : undefined,
          },
        };
      }
      if (!posted.value.run_id || posted.value.run_step_ids.length !== 1) {
        return {
          ok: false,
          error: {
            code: "provider_unavailable",
            message: "AG-UI run persistence requires a single-coworker SQL-backed run.",
          },
        };
      }

      const runStepId = posted.value.run_step_ids[0]!;
      const bound = await bindDurableTrueForgeTurn({
        sql,
        trueforgeClient,
        runStepId,
        content,
        clientAguiRunId: input.runId,
      });
      if (!bound.ok) {
        return {
          ok: false,
          error: {
            code: "provider_unavailable",
            message: "Could not bind a durable TrueForge turn for the AG-UI run.",
            details: { reason: bound.reason },
          },
        };
      }

      return {
        ok: true,
        value: {
          threadId: resolved.value.logicalThreadId,
          aguiRunId: bound.value.aguiRunId,
          applicationRunId: posted.value.run_id,
          runStepId,
          agentTurnId: bound.value.agentTurnId,
          messageId: posted.value.message_id,
          channelId,
          coworkerId,
          trueforgeSessionId: bound.value.trueforgeSessionId,
          trueforgeTurnId: bound.value.trueforgeTurnId,
        },
      };
    },

    async streamPreparedRun(bootstrap, write, streamOptions) {
      if (!trueforgeClient) {
        throw new Error("TrueForge runtime is not configured");
      }
      if (!sql) {
        throw new Error("SQL is required for durable AG-UI streaming");
      }
      const adapter = new TrueForgeAGUIAdapter({
        channelId: bootstrap.channelId,
        coworkerId: bootstrap.coworkerId,
        logicalThreadId: bootstrap.threadId,
        aguiRunId: bootstrap.aguiRunId,
        applicationRunId: bootstrap.applicationRunId,
        runStepId: bootstrap.runStepId,
        agentTurnId: bootstrap.agentTurnId,
      });

      let observedTerminal = false;
      const rawTrueForgeEvents: Array<Record<string, unknown>> = [];
      let deliveryAuthorized = true;
      let durableMirrorHealthy = true;
      const canDeliver = async () => {
        if (!deliveryAuthorized) {
          return false;
        }
        if (!streamOptions?.isDeliveryAuthorized) {
          return true;
        }
        try {
          deliveryAuthorized = await streamOptions.isDeliveryAuthorized();
        } catch {
          deliveryAuthorized = false;
        }
        return deliveryAuthorized;
      };
      const writeEvent = async (event: Record<string, unknown>) => {
        const durableEvent = toPersistedAgUiEvent(event);
        if (durableEvent && durableMirrorHealthy) {
          const mirrored = await workspace.appendCoworkerAgUiEvent({
            channelId: bootstrap.channelId,
            coworkerId: bootstrap.coworkerId,
            logicalThreadId: bootstrap.threadId,
            applicationRunId: bootstrap.applicationRunId,
            runStepId: bootstrap.runStepId,
            agentTurnId: bootstrap.agentTurnId,
            aguiRunId: bootstrap.aguiRunId,
            sourceMessageId: bootstrap.messageId,
            event: durableEvent,
          });
          if (!mirrored.ok) {
            // Channel mirror outage must not abort provider ingestion or lifecycle settlement.
            durableMirrorHealthy = false;
          }
        }
        if (await canDeliver()) {
          await write(formatAgUiSseEvent(event));
        }
      };
      const writeTerminalError = async (message: string) => {
        if (observedTerminal) {
          return;
        }
        observedTerminal = true;
        for (const event of adapter.buildRunError(message)) {
          if (durableMirrorHealthy) {
            await writeEvent(event);
          } else if (await canDeliver()) {
            await write(formatAgUiSseEvent(event));
          }
        }
      };

      try {
        await writeEvent(adapter.buildRunStarted());
        await pollTrueForgeTurnEvents({
          adapter,
          sessionId: bootstrap.trueforgeSessionId,
          turnId: bootstrap.trueforgeTurnId,
          listEvents: async (sessionId, turnId) => {
            const rows = await trueforgeClient.listTurnEvents(sessionId, turnId);
            return rows as Array<Record<string, unknown>>;
          },
          onUpstreamEvent: async (raw) => {
            rawTrueForgeEvents.push(raw);
            const normalized = normalizeTrueForgeEvent(raw);
            if (normalized.normalizedType === "turn.done") {
              const captured = await captureTrueForgeRequiredActions({
                sql,
                bootstrap,
                raw,
                rawEvents: rawTrueForgeEvents,
              });
              if (!captured.ok) {
                throw new Error(`Trusted required-action capture failed: ${captured.reason}`);
              }
              if (artifacts) {
                // Artifact publication is secondary to the trusted pause boundary.
                // A missing/invalid file must never erase an approval that was durably captured.
                await persistAgUiSandboxArtifacts({
                  sql,
                  bootstrap,
                  rawEvents: rawTrueForgeEvents,
                  trueforgeClient,
                  artifacts,
                }).catch(async () => {
                  await recordAgUiArtifactProjectionFailure({
                    sql,
                    bootstrap,
                    terminalEventId: readNonEmptyString(raw.id),
                  });
                });
              }
            }
            const turnDoneOutcome =
              normalized.normalizedType === "turn.done"
                ? evaluateTurnDoneOutcome(normalized.payloadRedacted)
                : null;
            const ingested = await ingestNormalizedTrueForgeEvent(sql, {
              agentTurnId: bootstrap.agentTurnId,
              expectedTurnStates: [
                "creating",
                "streaming",
                "required_actions",
                "completed",
                "failed",
              ],
              event: normalized,
              turnDoneOutcome,
            });
            if (!ingested.ok) {
              throw new Error("Durable TrueForge event ingestion failed");
            }
          },
          onEvent: async (event) => {
            if (event.type === "RUN_FINISHED" || event.type === "RUN_ERROR") {
              observedTerminal = true;
            }
            await writeEvent(event);
          },
        });
        if (!observedTerminal) {
          await writeTerminalError("Timed out waiting for a terminal AG-UI run event.");
        }
      } catch {
        await writeTerminalError("AG-UI run failed while reading provider events.");
      }
    },
  };
}
