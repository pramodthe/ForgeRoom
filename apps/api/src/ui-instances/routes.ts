import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  uiInteractionCommitCommandSchema,
  uiInteractionTokenRequestSchema,
  type ErrorCode,
} from "@forgeroom/contracts";
import type { AuthService } from "../auth/service";
import type { ApiEnv } from "../env";
import { errorResponse } from "../http";
import { requireMutationSession, requireParam, requireSession } from "../http-guards";
import type { UiInstanceService } from "./service";

function fail(
  c: Context,
  error: {
    code: string;
    message: string;
  },
) {
  const status: ContentfulStatusCode =
    error.code === "not_found"
      ? 404
      : error.code === "forbidden" || error.code === "unauthenticated"
        ? error.code === "unauthenticated"
          ? 401
          : 403
        : error.code === "conflict" || error.code === "ui_instance_stale"
          ? 409
          : error.code === "provider_unavailable"
            ? 503
            : 400;
  const failure = errorResponse(error.code as ErrorCode, error.message, { status });
  return c.json(failure.body, failure.status);
}

export function mountUiInstanceRoutes(
  app: {
    get: (path: string, handler: (c: Context) => Response | Promise<Response>) => unknown;
    post: (path: string, handler: (c: Context) => Response | Promise<Response>) => unknown;
  },
  options: { env: ApiEnv; auth: AuthService; uiInstances: UiInstanceService },
) {
  const { env, auth, uiInstances } = options;

  app.get("/api/ui-instances/:instanceId", async (c) => {
    const authed = await requireSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const instanceId = requireParam(c, "instanceId");
    if (instanceId instanceof Response) {
      return instanceId;
    }
    const result = await uiInstances.getReplay(authed.session, instanceId);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return c.json(result.value.replay, 200);
  });

  app.post("/api/ui-instances/:instanceId/interaction-tokens", async (c) => {
    const authed = await requireMutationSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const instanceId = requireParam(c, "instanceId");
    if (instanceId instanceof Response) {
      return instanceId;
    }
    const parsed = uiInteractionTokenRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return fail(c, {
        code: "validation_failed",
        message: "Invalid interaction token request.",
      });
    }
    const result = await uiInstances.issueInteractionToken(authed.session, instanceId, parsed.data);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return c.json(result.value, 200);
  });

  app.post("/api/ui-instances/:instanceId/interactions", async (c) => {
    const authed = await requireMutationSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const instanceId = requireParam(c, "instanceId");
    if (instanceId instanceof Response) {
      return instanceId;
    }
    const parsed = uiInteractionCommitCommandSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return fail(c, {
        code: "validation_failed",
        message: "Invalid interaction commit command.",
      });
    }
    const result = await uiInstances.commitInteraction(authed.session, instanceId, parsed.data);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return c.json(result.value, 200);
  });
}
