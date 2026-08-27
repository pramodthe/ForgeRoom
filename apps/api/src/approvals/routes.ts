import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ErrorCode, SafeJsonObject } from "@forgeroom/contracts";
import { randomOpaqueId } from "../auth/crypto";
import type { AuthService } from "../auth/service";
import type { ApiEnv } from "../env";
import { errorResponse } from "../http";
import {
  readSessionCookie,
  requireMutationSession,
  requireParam,
  requireSession,
} from "../http-guards";
import { parseApprovalDecisionCommand, type ApprovalService } from "./service";

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
        : error.code === "decision_already_recorded" ||
            error.code === "conflict" ||
            error.code === "stale_proposal" ||
            error.code === "expired_proposal"
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

export function mountApprovalRoutes(
  app: {
    get: (path: string, handler: (c: Context) => Response | Promise<Response>) => unknown;
    post: (path: string, handler: (c: Context) => Response | Promise<Response>) => unknown;
  },
  options: { env: ApiEnv; auth: AuthService; approvals: ApprovalService },
) {
  const { env, auth, approvals } = options;

  app.get("/api/approvals/:proposalId", async (c) => {
    const authed = await requireSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const proposalId = requireParam(c, "proposalId");
    if (proposalId instanceof Response) {
      return proposalId;
    }
    const result = await approvals.getApprovalCard(authed.session, proposalId);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, { card: result.value }, 200);
  });

  app.post("/api/approvals/:proposalId/decision", async (c) => {
    const authed = await requireMutationSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const recent = await auth.assertRecentAuth(readSessionCookie(c, env));
    if (!recent.ok) {
      return fail(c, {
        code: "forbidden",
        message: "Recent authentication required.",
        details: { reason: "recent_auth_required" },
      });
    }
    const proposalId = requireParam(c, "proposalId");
    if (proposalId instanceof Response) {
      return proposalId;
    }
    const parsed = parseApprovalDecisionCommand(await c.req.json().catch(() => null));
    if (!parsed.ok) {
      const failure = errorResponse("validation_failed", "Invalid approval decision command.", {
        status: 400,
      });
      return c.json(failure.body, failure.status);
    }
    const result = await approvals.decideApproval(authed.session, proposalId, parsed.value);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, result.value, 200);
  });
}
