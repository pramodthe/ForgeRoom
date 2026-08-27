import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ErrorCode, SafeJsonObject } from "@forgeroom/contracts";
import { randomOpaqueId } from "../auth/crypto";
import type { AuthService } from "../auth/service";
import type { ApiEnv } from "../env";
import { errorResponse } from "../http";
import { requireMutationSession, requireParam, requireSession } from "../http-guards";
import { parseCoworkerComponentGrantCommand, type ComponentService } from "./service";

function fail(
  c: Context,
  error: {
    code: string;
    message: string;
    details?: SafeJsonObject;
  },
) {
  const status =
    error.code === "not_found"
      ? 404
      : error.code === "forbidden"
        ? 403
        : error.code === "conflict"
          ? 409
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

export function mountComponentRoutes(
  app: {
    get: (path: string, handler: (c: Context) => Response | Promise<Response>) => unknown;
    post: (path: string, handler: (c: Context) => Response | Promise<Response>) => unknown;
  },
  options: { env: ApiEnv; auth: AuthService; components: ComponentService },
) {
  const { env, auth, components } = options;

  app.get("/api/workspaces/:workspaceId/components", async (c) => {
    const authed = await requireSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const workspaceId = requireParam(c, "workspaceId");
    if (workspaceId instanceof Response) {
      return workspaceId;
    }
    const result = await components.listWorkspaceComponents(authed.session, workspaceId);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, result.value, 200);
  });

  app.get("/api/coworkers/:coworkerId/component-grants", async (c) => {
    const authed = await requireSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const coworkerId = requireParam(c, "coworkerId");
    if (coworkerId instanceof Response) {
      return coworkerId;
    }
    const result = await components.listCoworkerComponentGrants(authed.session, coworkerId);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, result.value, 200);
  });

  app.post("/api/coworkers/:coworkerId/component-grants", async (c) => {
    const authed = await requireMutationSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const coworkerId = requireParam(c, "coworkerId");
    if (coworkerId instanceof Response) {
      return coworkerId;
    }
    const parsed = parseCoworkerComponentGrantCommand(await c.req.json().catch(() => null));
    if (!parsed.ok) {
      const failure = errorResponse("validation_failed", "Invalid component grant command.", {
        status: 400,
      });
      return c.json(failure.body, failure.status);
    }
    const result = await components.setCoworkerComponentGrant(
      authed.session,
      coworkerId,
      parsed.value,
    );
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, result.value, 200);
  });
}
