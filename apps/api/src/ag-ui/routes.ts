import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { SafeJsonObject } from "@forgeroom/contracts";
import type { createSql } from "@forgeroom/db";
import type { AuthService } from "../auth/service";
import type { ApiEnv } from "../env";
import { errorResponse } from "../http";
import { requireMutationSession, requireParam, requireSession } from "../http-guards";
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
  const agUi = createAgUiRunService({
    workspace: options.workspace,
    ...(options.trueforgeClient ? { trueforgeClient: options.trueforgeClient } : {}),
    ...(options.sql ? { sql: options.sql } : {}),
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
      try {
        await agUi.streamPreparedRun(prepared.value, async (chunk) => {
          await stream.write(chunk);
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "AG-UI run stream failed.";
        await stream.write(
          `data: ${JSON.stringify({
            type: "RUN_ERROR",
            threadId: prepared.value.threadId,
            runId: prepared.value.aguiRunId,
            message,
          })}\n\n`,
        );
      }
    });
  });
}
