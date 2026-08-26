import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { getCookie } from "hono/cookie";
import type { SessionResponse } from "@forgeroom/contracts";
import type { ApiEnv } from "./env";
import type { AuthService } from "./auth/service";
import { errorResponse } from "./http";

export function readSessionCookie(c: Context, env: ApiEnv): string | undefined {
  return getCookie(c, env.sessionCookieName);
}

export function mutationGuardInput(c: Context, env: ApiEnv) {
  return {
    cookieValue: readSessionCookie(c, env),
    origin: c.req.header("origin"),
    referer: c.req.header("referer"),
    csrfHeader: c.req.header("x-csrf-token"),
    forgedUserId: c.req.header("x-forgeroom-user-id"),
  };
}

export function guardStatus(
  reason: "unauthenticated" | "csrf_failed" | "forbidden",
): ContentfulStatusCode {
  return reason === "unauthenticated" ? 401 : 403;
}

export async function requireSession(
  c: Context,
  env: ApiEnv,
  auth: AuthService,
): Promise<Response | { session: SessionResponse }> {
  const session = await auth.readSession(readSessionCookie(c, env));
  if (!session) {
    const failure = errorResponse("unauthenticated", "No active session.", { status: 401 });
    return c.json(failure.body, failure.status);
  }
  return { session };
}

export async function requireMutationSession(
  c: Context,
  env: ApiEnv,
  auth: AuthService,
): Promise<Response | { session: SessionResponse }> {
  const guards = await auth.assertMutationGuards(mutationGuardInput(c, env));
  if (!guards.ok) {
    const code = guards.reason === "csrf_failed" ? "csrf_failed" : guards.reason;
    const failure = errorResponse(code, "Mutation rejected.", {
      status: guardStatus(guards.reason),
    });
    return c.json(failure.body, failure.status);
  }
  return { session: guards.session };
}

export function requireParam(c: Context, name: string): string | Response {
  const value = c.req.param(name);
  if (!value) {
    const failure = errorResponse("validation_failed", `Missing path parameter ${name}.`, {
      status: 400,
    });
    return c.json(failure.body, failure.status);
  }
  return value;
}
