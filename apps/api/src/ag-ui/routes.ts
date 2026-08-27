import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { SafeJsonObject } from "@forgeroom/contracts";
import type { createSql } from "@forgeroom/db";
import { loadComposioSessionClientFromEnv } from "@forgeroom/composio";
import type { AuthService } from "../auth/service";
import type { ApiEnv } from "../env";
import { errorResponse } from "../http";
import {
  mutationGuardInput,
  requireMutationSession,
  requireParam,
  requireSession,
} from "../http-guards";
import { createAgUiRunService, type AgUiRunServiceError } from "./run-service";
import type { WorkspaceService } from "../workspace/service";

function fail(c: Context, error: AgUiRunServiceError) {
  const status =
    error.code === "not_found"
      ? 404
      : error.code === "forbidden"
        ? 403
        : error.code === "recipient_unavailable"
          ? 409
          : error.code === "provider_unavailable"
            ? 503
            : 400;
  const failure = errorResponse(error.code, error.message, {
    status,
    details: error.details as SafeJsonObject | undefined,
  });
  return c.json(failure.body, failure.status);
}

export function mountAgUiRoutes(
  app: {
    get: (path: string, handler: (c: Context) => Response | Promise<Response>) => unknown;
    post: (path: string, handler: (c: Context) => Response | Promise<Response>) => unknown;
  },
  options: {
    env: ApiEnv;
    auth: AuthService;
    workspace: WorkspaceService;
    trueforgeClient?: import("@forgeroom/trueforge").TrueForgeClient;
    sql?: ReturnType<typeof createSql>;
  },
) {
  const composio =
    options.env.composioApiKey && options.env.composioConnectedAccountId
      ? loadComposioSessionClientFromEnv({
          COMPOSIO_API_KEY: options.env.composioApiKey,
          COMPOSIO_USER_ID: options.env.composioUserId ?? undefined,
          COMPOSIO_CONNECTED_ACCOUNT_ID: options.env.composioConnectedAccountId,
          COMPOSIO_AUTH_CONFIG_ID: options.env.composioAuthConfigId ?? undefined,
          COMPOSIO_BASE_URL: options.env.composioBaseUrl ?? undefined,
        })
      : undefined;
  const agUi = createAgUiRunService({
    workspace: options.workspace,
    ...(options.trueforgeClient ? { trueforgeClient: options.trueforgeClient } : {}),
    ...(composio ? { composio } : {}),
    ...(options.sql ? { sql: options.sql } : {}),
    pausePayloadEncryptionSecret: options.env.pausePayloadEncryptionSecret,
  });

  app.get("/api/ag-ui/channels/:channelId/coworkers/:coworkerId/capabilities", async (c) => {
    const authed = await requireSession(c, options.env, options.auth);
    if (authed instanceof Response) {
      return authed;
    }
    const channelId = requireParam(c, "channelId");
    if (channelId instanceof Response) {
      return channelId;
    }
    const coworkerId = requireParam(c, "coworkerId");
    if (coworkerId instanceof Response) {
      return coworkerId;
    }
    const result = await agUi.getCapabilities(authed.session, channelId, coworkerId);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return c.json(result.value);
  });

  app.post("/api/ag-ui/channels/:channelId/coworkers/:coworkerId/runs", async (c) => {
    const liveGuardInput = mutationGuardInput(c, options.env);
    const authed = await requireMutationSession(c, options.env, options.auth);
    if (authed instanceof Response) {
      return authed;
    }
    const channelId = requireParam(c, "channelId");
    if (channelId instanceof Response) {
      return channelId;
    }
    const coworkerId = requireParam(c, "coworkerId");
    if (coworkerId instanceof Response) {
      return coworkerId;
    }
    const body = await c.req.json().catch(() => null);
    const prepared = await agUi.prepareRun(authed.session, channelId, coworkerId, body);
    if (!prepared.ok) {
      return fail(c, prepared.error);
    }

    return streamSSE(c, async (stream) => {
      await agUi.streamPreparedRun(
        prepared.value,
        async (chunk) => {
          await stream.write(chunk);
        },
        {
          isDeliveryAuthorized: async () => {
            const live = await options.auth.assertMutationGuards(liveGuardInput);
            if (
              !live.ok ||
              live.session.user.id !== authed.session.user.id ||
              live.session.workspace_id !== authed.session.workspace_id
            ) {
              return false;
            }
            const resolved = await options.workspace.resolveAgUiCoworkerContext(
              live.session,
              channelId,
              coworkerId,
            );
            return (
              resolved.ok &&
              resolved.value.logicalThreadId === prepared.value.threadId &&
              resolved.value.availability === "available"
            );
          },
        },
      );
    });
  });
}
