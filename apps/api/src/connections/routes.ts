import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ErrorCode, SafeJsonObject } from "@forgeroom/contracts";
import { randomOpaqueId } from "../auth/crypto";
import type { AuthService } from "../auth/service";
import type { ApiEnv } from "../env";
import { errorResponse } from "../http";
import { requireMutationSession, requireParam, requireSession } from "../http-guards";
import {
  parseConnectionReconnectCommand,
  parseConnectionTestCommand,
  type ConnectionService,
} from "./service";

function fail(
  c: Context,
  error: {
    code: string;
    message: string;
    details?: SafeJsonObject;
  },
) {
  const status: ContentfulStatusCode =
    error.code === "not_found"
      ? 404
      : error.code === "forbidden" ||
          error.code === "csrf_failed" ||
          error.code === "unauthenticated"
        ? error.code === "unauthenticated"
          ? 401
          : 403
        : error.code === "conflict" || error.code === "provider_unavailable"
          ? error.code === "provider_unavailable"
            ? 503
            : 409
          : 400;
  const failure = errorResponse(error.code as ErrorCode, error.message, {
    status,
    details: error.details,
  });
  return c.json(failure.body, failure.status);
}

function okJson(c: Context, body: object, status: ContentfulStatusCode) {
  return c.json({ ...body, request_id: randomOpaqueId("req") }, status);
}

export function mountConnectionRoutes(
  app: {
    get: (path: string, handler: (c: Context) => Response | Promise<Response>) => unknown;
    post: (path: string, handler: (c: Context) => Response | Promise<Response>) => unknown;
    all?: (path: string, handler: (c: Context) => Response | Promise<Response>) => unknown;
  },
  options: { env: ApiEnv; auth: AuthService; connections: ConnectionService },
) {
  const { env, auth, connections } = options;

  // P0 closed surface: no catalog browse / add-account endpoints.
  const closed = (c: Context) => {
    const failure = errorResponse(
      "not_found",
      "Connection catalog and account-management endpoints are not available in P0.",
      { status: 404 },
    );
    return c.json(failure.body, failure.status);
  };
  if (app.all) {
    app.all("/api/connections/catalog", closed);
    app.all("/api/connections/accounts", closed);
    app.all("/api/workspaces/:workspaceId/connections/catalog", closed);
  }

  app.get("/api/workspaces/:workspaceId/connections", async (c) => {
    const authed = await requireSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const workspaceId = requireParam(c, "workspaceId");
    if (workspaceId instanceof Response) {
      return workspaceId;
    }
    const result = await connections.listConnections(authed.session, workspaceId);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, result.value, 200);
  });

  app.get("/api/connections/:connectionId/status", async (c) => {
    const authed = await requireSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const connectionId = requireParam(c, "connectionId");
    if (connectionId instanceof Response) {
      return connectionId;
    }
    const result = await connections.getStatus(authed.session, connectionId);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, result.value, 200);
  });

  app.post("/api/connections/:connectionId/test", async (c) => {
    const authed = await requireMutationSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const connectionId = requireParam(c, "connectionId");
    if (connectionId instanceof Response) {
      return connectionId;
    }
    const parsed = parseConnectionTestCommand(await c.req.json().catch(() => null));
    if (!parsed.ok) {
      const failure = errorResponse("validation_failed", "Invalid connection test command.", {
        status: 400,
      });
      return c.json(failure.body, failure.status);
    }
    const result = await connections.testConnection(authed.session, connectionId, parsed.value);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, result.value, 200);
  });

  app.post("/api/connections/:connectionId/reconnect", async (c) => {
    const authed = await requireMutationSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const connectionId = requireParam(c, "connectionId");
    if (connectionId instanceof Response) {
      return connectionId;
    }
    const parsed = parseConnectionReconnectCommand(await c.req.json().catch(() => null));
    if (!parsed.ok) {
      const failure = errorResponse("validation_failed", "Invalid connection reconnect command.", {
        status: 400,
      });
      return c.json(failure.body, failure.status);
    }
    const result = await connections.reconnect(authed.session, connectionId, parsed.value);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, result.value, 200);
  });

  app.get("/api/connections/:connectionId/reconnect/status", async (c) => {
    const authed = await requireSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const connectionId = requireParam(c, "connectionId");
    if (connectionId instanceof Response) {
      return connectionId;
    }
    const result = await connections.reconnectStatus(authed.session, connectionId);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, result.value, 200);
  });
}
