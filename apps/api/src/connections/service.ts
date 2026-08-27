import {
  connectionListItemSchema,
  connectionReconnectCommandSchema,
  connectionReconnectResultSchema,
  connectionReconnectStatusSchema,
  connectionStatusViewSchema,
  connectionTestCommandSchema,
  connectionTestResultSchema,
  type ConnectionListItem,
  type ConnectionReconnectCommand,
  type ConnectionReconnectResult,
  type ConnectionReconnectStatus,
  type ConnectionStatusView,
  type ConnectionTestCommand,
  type ConnectionTestResult,
  type ErrorCode,
  type SessionResponse,
} from "@forgeroom/contracts";
import {
  ComposioSessionClient,
  P0_COMPOSIO_CONNECTION_ID,
  P0_COMPOSIO_DIRECT_TOOLS,
  P0_COMPOSIO_READ_TOOL,
  P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME,
  assertReconnectBoundToWorkspace,
  buildConnectionStatusView,
  buildP0ActingIdentity,
  evaluateConnectionTest,
  evaluatePinnedConnectionGate,
  loadComposioSessionClientFromEnv,
  p0DemoReadArguments,
  type ReconnectBinding,
} from "@forgeroom/composio";
import {
  ConnectorBindingWorkspaceConflictError,
  deleteExpiredConnectionReconnectIntents,
  ensureP0ConnectorBinding,
  findActiveReconnectIntentForActor,
  findLatestReconnectIntentForActor,
  findReconnectIntentByIdempotencyKey,
  loadConnectorBinding,
  saveConnectionReconnectIntent,
  updateConnectorBindingStatus,
  type StoredReconnectIntent,
  type createSql,
} from "@forgeroom/db";
import { randomOpaqueId } from "../auth/crypto";
import type { ApiEnv } from "../env";

type SqlClient = ReturnType<typeof createSql>;

export type ConnectionServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: ErrorCode; message: string } };

export function parseConnectionTestCommand(
  input: unknown,
): { ok: true; value: ConnectionTestCommand } | { ok: false } {
  const parsed = connectionTestCommandSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false };
  }
  return { ok: true, value: parsed.data };
}

export function parseConnectionReconnectCommand(
  input: unknown,
): { ok: true; value: ConnectionReconnectCommand } | { ok: false } {
  const parsed = connectionReconnectCommandSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false };
  }
  return { ok: true, value: parsed.data };
}

export type ConnectionService = {
  listConnections(
    session: SessionResponse,
    workspaceId: string,
  ): Promise<ConnectionServiceResult<{ connections: ConnectionListItem[] }>>;
  getStatus(
    session: SessionResponse,
    connectionId: string,
  ): Promise<ConnectionServiceResult<{ connection: ConnectionStatusView }>>;
  testConnection(
    session: SessionResponse,
    connectionId: string,
    command: ConnectionTestCommand,
  ): Promise<ConnectionServiceResult<ConnectionTestResult>>;
  reconnect(
    session: SessionResponse,
    connectionId: string,
    command: ConnectionReconnectCommand,
  ): Promise<ConnectionServiceResult<ConnectionReconnectResult>>;
  reconnectStatus(
    session: SessionResponse,
    connectionId: string,
  ): Promise<ConnectionServiceResult<ConnectionReconnectStatus>>;
};

type ConnectionServiceOptions = {
  env: ApiEnv;
  sql?: SqlClient;
  composio?: ComposioSessionClient | null;
  /** Optional callback URL appended to Connect Link creation. */
  reconnectCallbackUrl?: string;
};

function storedIntentToBinding(intent: StoredReconnectIntent): ReconnectBinding {
  return {
    intentId: intent.intentId,
    connectionId: intent.connectionId,
    workspaceId: intent.workspaceId,
    actorUserId: intent.actorUserId,
    expectedConnectedAccountId: intent.expectedConnectedAccountId,
    redirectUrl: intent.redirectUrl,
    expiresAt: intent.expiresAt,
    provisionalConnectedAccountId: intent.provisionalConnectedAccountId,
    createdAt: intent.createdAt,
  };
}

function purgeExpiredIntents(intents: Map<string, ReconnectBinding>, now?: string): void {
  const nowMs = Date.parse(now ?? new Date().toISOString());
  for (const [intentId, binding] of intents) {
    const expiresMs = Date.parse(binding.expiresAt);
    if (Number.isFinite(expiresMs) && nowMs > expiresMs) {
      intents.delete(intentId);
    }
  }
}

function reconnectResultFromBinding(binding: ReconnectBinding): ConnectionReconnectResult {
  return connectionReconnectResultSchema.parse({
    schemaVersion: 1,
    connection_id: binding.connectionId,
    intent_id: binding.intentId,
    status: "connecting",
    redirect_url: binding.redirectUrl,
    expires_at: binding.expiresAt,
    workspace_bound: true,
    expected_account_suffix: binding.expectedConnectedAccountId.slice(-4),
  });
}

export function createConnectionService(options: ConnectionServiceOptions): ConnectionService {
  const intents = new Map<string, ReconnectBinding>();
  const composio =
    options.composio === undefined
      ? options.env.composioApiKey &&
        options.env.composioUserId &&
        options.env.composioConnectedAccountId
        ? loadComposioSessionClientFromEnv({
            COMPOSIO_API_KEY: options.env.composioApiKey,
            COMPOSIO_USER_ID: options.env.composioUserId,
            COMPOSIO_CONNECTED_ACCOUNT_ID: options.env.composioConnectedAccountId,
            COMPOSIO_AUTH_CONFIG_ID: options.env.composioAuthConfigId ?? undefined,
            COMPOSIO_BASE_URL: options.env.composioBaseUrl ?? undefined,
          })
        : null
      : options.composio;

  async function requireWorkspace(
    session: SessionResponse,
    workspaceId: string,
  ): Promise<ConnectionServiceResult<true>> {
    if (session.workspace_id !== workspaceId) {
      return {
        ok: false,
        error: { code: "forbidden", message: "Workspace is outside this session." },
      };
    }
    return { ok: true, value: true };
  }

  async function requireConnection(
    session: SessionResponse,
    connectionId: string,
  ): Promise<ConnectionServiceResult<true>> {
    if (connectionId !== P0_COMPOSIO_CONNECTION_ID) {
      return {
        ok: false,
        error: { code: "not_found", message: "Connection not found." },
      };
    }
    if (!composio) {
      return {
        ok: false,
        error: {
          code: "provider_unavailable",
          message: "Composio connection credentials are not configured.",
        },
      };
    }
    if (options.sql) {
      try {
        await ensureP0ConnectorBinding(options.sql, {
          connectionId: P0_COMPOSIO_CONNECTION_ID,
          workspaceId: session.workspace_id,
          composioUserId: composio.composioUserId,
          trueforgeConnectorName: P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME,
          allowedTools: P0_COMPOSIO_DIRECT_TOOLS,
          actingIdentity: buildP0ActingIdentity(composio.pinnedConnectedAccountId),
          status: "unconfigured",
        });
      } catch (error) {
        if (error instanceof ConnectorBindingWorkspaceConflictError) {
          return {
            ok: false,
            error: {
              code: "forbidden",
              message: "Connection is outside this workspace.",
            },
          };
        }
        throw error;
      }
      const loaded = await loadConnectorBinding(options.sql, {
        connectionId,
        workspaceId: session.workspace_id,
      });
      if (!loaded.ok) {
        return {
          ok: false,
          error: {
            code: loaded.reason === "forbidden" ? "forbidden" : "not_found",
            message:
              loaded.reason === "forbidden"
                ? "Connection is outside this workspace."
                : "Connection not found.",
          },
        };
      }
    }
    return { ok: true, value: true };
  }

  async function observeStatus(
    session: SessionResponse,
  ): Promise<ConnectionServiceResult<ConnectionStatusView>> {
    if (!composio) {
      return {
        ok: false,
        error: { code: "provider_unavailable", message: "Composio is not configured." },
      };
    }
    try {
      const account = await composio.getConnectedAccountDetails();
      if (!account.id) {
        return {
          ok: false,
          error: {
            code: "provider_unavailable",
            message: "Composio did not confirm connected account identity.",
          },
        };
      }
      const now = new Date().toISOString();
      const view = connectionStatusViewSchema.parse(
        buildConnectionStatusView({
          workspaceId: session.workspace_id,
          connectionId: P0_COMPOSIO_CONNECTION_ID,
          account,
          expectedConnectedAccountId: composio.pinnedConnectedAccountId,
          verifiedAt: now,
          actingIdentity: buildP0ActingIdentity(composio.pinnedConnectedAccountId),
        }),
      );
      if (options.sql) {
        await updateConnectorBindingStatus(options.sql, {
          connectionId: P0_COMPOSIO_CONNECTION_ID,
          workspaceId: session.workspace_id,
          status: view.status,
          verifiedAt: view.verified_at,
          actingIdentity: view.acting_identity,
        });
      }
      return { ok: true, value: view };
    } catch {
      return {
        ok: false,
        error: {
          code: "provider_unavailable",
          message: "Composio connection status could not be observed.",
        },
      };
    }
  }

  async function loadReusableReconnectIntent(input: {
    workspaceId: string;
    connectionId: string;
    actorUserId: string;
    idempotencyKey: string;
  }): Promise<ReconnectBinding | null> {
    if (options.sql) {
      await deleteExpiredConnectionReconnectIntents(options.sql);
      const byKey = await findReconnectIntentByIdempotencyKey(options.sql, input);
      if (byKey) {
        return storedIntentToBinding(byKey);
      }
      const active = await findActiveReconnectIntentForActor(options.sql, {
        workspaceId: input.workspaceId,
        connectionId: input.connectionId,
        actorUserId: input.actorUserId,
      });
      return active ? storedIntentToBinding(active) : null;
    }

    purgeExpiredIntents(intents);
    for (const existing of intents.values()) {
      if (
        existing.connectionId === input.connectionId &&
        existing.workspaceId === input.workspaceId &&
        existing.actorUserId === input.actorUserId
      ) {
        return existing;
      }
    }
    return null;
  }

  async function persistReconnectIntent(input: StoredReconnectIntent): Promise<ReconnectBinding> {
    if (options.sql) {
      const saved = await saveConnectionReconnectIntent(options.sql, input);
      return storedIntentToBinding(saved);
    }
    const binding = storedIntentToBinding(input);
    intents.set(binding.intentId, binding);
    return binding;
  }

  async function resolveReconnectIntentForStatus(input: {
    workspaceId: string;
    connectionId: string;
    actorUserId: string;
    now?: string;
  }): Promise<
    | { kind: "none" }
    | { kind: "active"; binding: ReconnectBinding }
    | { kind: "expired"; binding: ReconnectBinding }
  > {
    const now = input.now ?? new Date().toISOString();
    if (options.sql) {
      const latest = await findLatestReconnectIntentForActor(options.sql, input);
      if (!latest) {
        await deleteExpiredConnectionReconnectIntents(options.sql, now);
        return { kind: "none" };
      }
      if (latest.expiresAt <= now) {
        await deleteExpiredConnectionReconnectIntents(options.sql, now);
        return { kind: "expired", binding: storedIntentToBinding(latest) };
      }
      await deleteExpiredConnectionReconnectIntents(options.sql, now);
      return { kind: "active", binding: storedIntentToBinding(latest) };
    }

    purgeExpiredIntents(intents);
    for (const binding of intents.values()) {
      if (
        binding.connectionId === input.connectionId &&
        binding.workspaceId === input.workspaceId &&
        binding.actorUserId === input.actorUserId
      ) {
        if (binding.expiresAt <= now) {
          intents.delete(binding.intentId);
          return { kind: "expired", binding };
        }
        return { kind: "active", binding };
      }
    }
    return { kind: "none" };
  }

  return {
    async listConnections(session, workspaceId) {
      const access = await requireWorkspace(session, workspaceId);
      if (!access.ok) {
        return access;
      }
      const ready = await requireConnection(session, P0_COMPOSIO_CONNECTION_ID);
      if (!ready.ok) {
        return ready;
      }
      const view = await observeStatus(session);
      if (!view.ok) {
        return view;
      }
      const items: ConnectionListItem[] = [
        connectionListItemSchema.parse({
          id: view.value.id,
          toolkit: view.value.toolkit,
          status: view.value.status,
          acting_identity: view.value.acting_identity,
          verified_at: view.value.verified_at,
        }),
      ];
      return { ok: true, value: { connections: items } };
    },

    async getStatus(session, connectionId) {
      const ready = await requireConnection(session, connectionId);
      if (!ready.ok) {
        return ready;
      }
      const view = await observeStatus(session);
      if (!view.ok) {
        return view;
      }
      return { ok: true, value: { connection: view.value } };
    },

    async testConnection(session, connectionId, command) {
      const ready = await requireConnection(session, connectionId);
      if (!ready.ok) {
        return ready;
      }
      if (!composio) {
        return {
          ok: false,
          error: { code: "provider_unavailable", message: "Composio is not configured." },
        };
      }
      if (command.expected_connection_id !== connectionId) {
        return {
          ok: false,
          error: { code: "validation_failed", message: "expected_connection_id mismatch." },
        };
      }
      try {
        const account = await composio.getConnectedAccountDetails();
        if (!account.id) {
          return {
            ok: false,
            error: {
              code: "provider_unavailable",
              message: "Composio did not confirm connected account identity.",
            },
          };
        }
        const gate = evaluatePinnedConnectionGate({
          account,
          expectedConnectedAccountId: composio.pinnedConnectedAccountId,
        });
        let execute: {
          httpStatus: number;
          successful: boolean | null;
          authFailure: boolean;
        } | null = null;
        if (!gate.blocksDispatch) {
          const executed = await composio.executeDirectTool({
            toolSlug: P0_COMPOSIO_READ_TOOL,
            arguments: p0DemoReadArguments(),
          });
          execute = {
            httpStatus: executed.httpStatus,
            successful: executed.successful,
            authFailure: executed.authFailure,
          };
        }
        const result = connectionTestResultSchema.parse(
          evaluateConnectionTest({
            connectionId,
            expectedDescriptorHash: command.expected_descriptor_hash,
            account,
            expectedConnectedAccountId: composio.pinnedConnectedAccountId,
            execute,
          }),
        );
        if (options.sql) {
          await updateConnectorBindingStatus(options.sql, {
            connectionId,
            workspaceId: session.workspace_id,
            status: result.status,
            verifiedAt: result.verified_at,
          });
        }
        return { ok: true, value: result };
      } catch {
        return {
          ok: false,
          error: {
            code: "provider_unavailable",
            message: "Composio connection test could not be completed.",
          },
        };
      }
    },

    async reconnect(session, connectionId, command) {
      const ready = await requireConnection(session, connectionId);
      if (!ready.ok) {
        return ready;
      }
      if (!composio) {
        return {
          ok: false,
          error: { code: "provider_unavailable", message: "Composio is not configured." },
        };
      }
      if (command.expected_connection_id !== connectionId) {
        return {
          ok: false,
          error: { code: "validation_failed", message: "expected_connection_id mismatch." },
        };
      }
      if (!options.env.composioAuthConfigId) {
        return {
          ok: false,
          error: {
            code: "provider_unavailable",
            message: "COMPOSIO_AUTH_CONFIG_ID is required for reconnect.",
          },
        };
      }

      try {
        const reusable = await loadReusableReconnectIntent({
          workspaceId: session.workspace_id,
          connectionId,
          actorUserId: session.user.id,
          idempotencyKey: command.idempotency_key,
        });
        if (reusable) {
          const bound = assertReconnectBoundToWorkspace({
            binding: reusable,
            workspaceId: session.workspace_id,
            connectionId,
          });
          if (bound.ok) {
            return { ok: true, value: reconnectResultFromBinding(reusable) };
          }
        }

        const link = await composio.createConnectLink({
          authConfigId: options.env.composioAuthConfigId,
          ...(options.reconnectCallbackUrl
            ? { callbackUrl: options.reconnectCallbackUrl }
            : {}),
        });
        const intentId = randomOpaqueId("crec");
        const binding = await persistReconnectIntent({
          intentId,
          connectionId,
          workspaceId: session.workspace_id,
          actorUserId: session.user.id,
          idempotencyKey: command.idempotency_key,
          expectedConnectedAccountId: composio.pinnedConnectedAccountId,
          redirectUrl: link.redirectUrl,
          expiresAt: link.expiresAt,
          provisionalConnectedAccountId: link.provisionalConnectedAccountId,
          createdAt: new Date().toISOString(),
        });
        if (options.sql) {
          await updateConnectorBindingStatus(options.sql, {
            connectionId,
            workspaceId: session.workspace_id,
            status: "connecting",
            verifiedAt: null,
          });
        }
        return { ok: true, value: reconnectResultFromBinding(binding) };
      } catch {
        return {
          ok: false,
          error: {
            code: "provider_unavailable",
            message: "Composio reconnect link could not be created.",
          },
        };
      }
    },

    async reconnectStatus(session, connectionId) {
      const ready = await requireConnection(session, connectionId);
      if (!ready.ok) {
        return ready;
      }
      if (!composio) {
        return {
          ok: false,
          error: { code: "provider_unavailable", message: "Composio is not configured." },
        };
      }

      try {
        const intentStatus = await resolveReconnectIntentForStatus({
          workspaceId: session.workspace_id,
          connectionId,
          actorUserId: session.user.id,
        });
        const activeIntent =
          intentStatus.kind === "active" ? intentStatus.binding : null;
        const expiredIntent =
          intentStatus.kind === "expired" ? intentStatus.binding : null;

        const account = await composio.getConnectedAccountDetails();
        if (!account.id) {
          return {
            ok: false,
            error: {
              code: "provider_unavailable",
              message: "Composio did not confirm connected account identity.",
            },
          };
        }
        const gate = evaluatePinnedConnectionGate({
          account,
          expectedConnectedAccountId: composio.pinnedConnectedAccountId,
          observedAlternateAccountId: activeIntent?.provisionalConnectedAccountId ?? null,
        });

        let reconnectState: ConnectionReconnectStatus["reconnect_state"] = "idle";
        if (expiredIntent) {
          reconnectState = "expired";
        } else if (activeIntent) {
          const bound = assertReconnectBoundToWorkspace({
            binding: activeIntent,
            workspaceId: session.workspace_id,
            connectionId,
          });
          if (!bound.ok && bound.reason === "link_expired") {
            reconnectState = "expired";
          } else if (
            activeIntent.provisionalConnectedAccountId &&
            activeIntent.provisionalConnectedAccountId !== composio.pinnedConnectedAccountId
          ) {
            try {
              const provisional = await composio.getConnectedAccountDetails(
                activeIntent.provisionalConnectedAccountId,
              );
              if (
                provisional.id === activeIntent.provisionalConnectedAccountId &&
                provisional.status.trim().toUpperCase() === "ACTIVE" &&
                !provisional.isDisabled
              ) {
                reconnectState = "completed";
              } else {
                reconnectState = "pending";
              }
            } catch {
              reconnectState = "pending";
            }
          } else if (gate.status === "active") {
            // Pinned account was already active — wait for the Connect Link flow.
            reconnectState = "pending";
          } else {
            reconnectState = "pending";
          }
        }

        // Expired reconnect must not advertise a dispatchable active connection status.
        const connectionStatus =
          reconnectState === "expired" && gate.status === "active"
            ? "unconfigured"
            : gate.status;
        const blocksDispatch =
          reconnectState === "expired" ? true : gate.blocksDispatch;
        const runStepState =
          reconnectState === "expired" ? "blocked_connection" : gate.runStepState;
        const now = connectionStatus === "active" ? new Date().toISOString() : null;
        if (options.sql) {
          await updateConnectorBindingStatus(options.sql, {
            connectionId,
            workspaceId: session.workspace_id,
            status: connectionStatus,
            verifiedAt: now,
          });
        }

        return {
          ok: true,
          value: connectionReconnectStatusSchema.parse({
            schemaVersion: 1,
            connection_id: connectionId,
            intent_id: activeIntent?.intentId ?? expiredIntent?.intentId ?? null,
            reconnect_state: reconnectState,
            connection_status: connectionStatus,
            blocks_dispatch: blocksDispatch,
            run_step_state: runStepState,
            fallback_account_rejected: gate.fallbackAccountRejected,
            verified_at: now,
          }),
        };
      } catch {
        return {
          ok: false,
          error: {
            code: "provider_unavailable",
            message: "Composio reconnect status could not be observed.",
          },
        };
      }
    },
  };
}
