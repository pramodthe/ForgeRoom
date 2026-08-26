import type { AuthService } from "./service";
import { errorResponse } from "../http";
import { loginRequestSchema, sessionResponseSchema } from "@forgeroom/contracts";
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApiEnv } from "../env";
import { loginClientKey } from "./client-key";

function readCookie(c: Context, env: ApiEnv): string | undefined {
  return getCookie(c, env.sessionCookieName);
}

function writeSessionCookie(c: Context, env: ApiEnv, value: string, expiresAt: string) {
  setCookie(c, env.sessionCookieName, value, {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "Lax",
    path: "/",
    expires: new Date(expiresAt),
  });
}

function clearSessionCookie(c: Context, env: ApiEnv) {
  deleteCookie(c, env.sessionCookieName, {
    path: "/",
    secure: env.nodeEnv === "production",
    sameSite: "Lax",
  });
}

function guardStatus(
  reason: "unauthenticated" | "csrf_failed" | "forbidden",
): ContentfulStatusCode {
  return reason === "unauthenticated" ? 401 : 403;
}

function mutationGuardInput(c: Context, env: ApiEnv) {
  return {
    cookieValue: readCookie(c, env),
    origin: c.req.header("origin"),
    referer: c.req.header("referer"),
    csrfHeader: c.req.header("x-csrf-token"),
    forgedUserId: c.req.header("x-forgeroom-user-id"),
  };
}

export function mountAuthRoutes(
  app: {
    post: (path: string, handler: (c: Context) => Response | Promise<Response>) => unknown;
    get: (path: string, handler: (c: Context) => Response | Promise<Response>) => unknown;
  },
  options: { env: ApiEnv; auth: AuthService },
) {
  const { env, auth } = options;

  app.post("/api/auth/login", async (c) => {
    const parsed = loginRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      const failure = errorResponse("validation_failed", "Invalid login request.", {
        status: 400,
      });
      return c.json(failure.body, failure.status);
    }
    const result = await auth.login({
      email: parsed.data.email,
      password: parsed.data.password,
      clientKey: loginClientKey(c, env),
    });
    if (!result.ok && result.reason === "rate_limited") {
      const failure = errorResponse("forbidden", "Too many login attempts.", {
        status: 429,
        retryable: true,
        details: { reason: "rate_limited", retry_after_ms: result.retryAfterMs ?? 0 },
      });
      c.header("Retry-After", String(Math.ceil((result.retryAfterMs ?? 0) / 1000) || 1));
      return c.json(failure.body, failure.status);
    }
    if (!result.ok) {
      const failure = errorResponse("unauthenticated", "Invalid email or password.", {
        status: 401,
      });
      return c.json(failure.body, failure.status);
    }
    writeSessionCookie(c, env, result.cookieValue, result.session.expires_at);
    return c.json(sessionResponseSchema.parse(result.session), 200);
  });

  app.post("/api/auth/logout", async (c) => {
    const guards = await auth.assertMutationGuards(mutationGuardInput(c, env));
    if (!guards.ok) {
      const code = guards.reason === "csrf_failed" ? "csrf_failed" : guards.reason;
      const failure = errorResponse(code, "Logout rejected.", {
        status: guardStatus(guards.reason),
      });
      return c.json(failure.body, failure.status);
    }
    await auth.logout(readCookie(c, env));
    clearSessionCookie(c, env);
    return c.json({ request_id: guards.session.request_id, ok: true }, 200);
  });

  app.get("/api/session", async (c) => {
    const session = await auth.readSession(readCookie(c, env));
    if (!session) {
      const failure = errorResponse("unauthenticated", "No active session.", { status: 401 });
      return c.json(failure.body, failure.status);
    }
    return c.json(sessionResponseSchema.parse(session), 200);
  });

  app.post("/api/auth/probe", async (c) => {
    const guards = await auth.assertMutationGuards(mutationGuardInput(c, env));
    if (!guards.ok) {
      const code = guards.reason === "csrf_failed" ? "csrf_failed" : guards.reason;
      const failure = errorResponse(code, "Mutation rejected.", {
        status: guardStatus(guards.reason),
      });
      return c.json(failure.body, failure.status);
    }
    return c.json(
      { request_id: guards.session.request_id, ok: true, user_id: guards.session.user.id },
      200,
    );
  });

  app.post("/api/auth/recent-probe", async (c) => {
    const guards = await auth.assertMutationGuards(mutationGuardInput(c, env));
    if (!guards.ok) {
      const code = guards.reason === "csrf_failed" ? "csrf_failed" : guards.reason;
      const failure = errorResponse(code, "Mutation rejected.", {
        status: guardStatus(guards.reason),
      });
      return c.json(failure.body, failure.status);
    }
    const recent = await auth.assertRecentAuth(readCookie(c, env));
    if (!recent.ok) {
      const failure = errorResponse("forbidden", "Recent authentication required.", {
        status: 403,
        details: { reason: "recent_auth_required" },
      });
      return c.json(failure.body, failure.status);
    }
    return c.json({ request_id: recent.session.request_id, ok: true }, 200);
  });
}
