import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ErrorCode, SafeJsonObject } from "@forgeroom/contracts";
import { randomOpaqueId } from "../auth/crypto";
import type { AuthService } from "../auth/service";
import type { ApiEnv } from "../env";
import { errorResponse } from "../http";
import { requireMutationSession, requireParam, requireSession } from "../http-guards";
import { parseQuestionAnswerCommand, type QuestionService } from "./service";

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

export function mountQuestionRoutes(
  app: {
    get: (path: string, handler: (c: Context) => Response | Promise<Response>) => unknown;
    post: (path: string, handler: (c: Context) => Response | Promise<Response>) => unknown;
  },
  options: { env: ApiEnv; auth: AuthService; questions: QuestionService },
) {
  const { env, auth, questions } = options;

  app.get("/api/channels/:channelId/pending-questions", async (c) => {
    const authed = await requireSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const channelId = requireParam(c, "channelId");
    if (channelId instanceof Response) {
      return channelId;
    }
    const result = await questions.listPendingQuestions(authed.session, channelId);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, result.value, 200);
  });

  app.get("/api/questions/:questionId", async (c) => {
    const authed = await requireSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const questionId = requireParam(c, "questionId");
    if (questionId instanceof Response) {
      return questionId;
    }
    const result = await questions.getQuestionCard(authed.session, questionId);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, { card: result.value }, 200);
  });

  app.post("/api/questions/:questionId/answer", async (c) => {
    const authed = await requireMutationSession(c, env, auth);
    if (authed instanceof Response) {
      return authed;
    }
    const questionId = requireParam(c, "questionId");
    if (questionId instanceof Response) {
      return questionId;
    }
    const parsed = parseQuestionAnswerCommand(await c.req.json().catch(() => null));
    if (!parsed.ok) {
      const failure = errorResponse("validation_failed", "Invalid question answer command.", {
        status: 400,
      });
      return c.json(failure.body, failure.status);
    }
    const result = await questions.answerQuestion(authed.session, questionId, parsed.value);
    if (!result.ok) {
      return fail(c, result.error);
    }
    return okJson(c, result.value, 200);
  });
}
