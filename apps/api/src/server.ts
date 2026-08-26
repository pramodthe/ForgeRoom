import { Hono } from "hono";
import type { ApiEnv } from "./env";
import { createAuthService, type AuthService } from "./auth/service";
import { mountAuthRoutes } from "./auth/routes";
import { errorResponse } from "./http";

export function createApiApp(options?: { env?: ApiEnv; auth?: AuthService }) {
  const app = new Hono();
  const env = options?.env;
  const auth = options?.auth ?? (env ? createAuthService({ env }) : undefined);

  app.get("/health", (c) =>
    c.json({
      ok: true,
      service: "forgeroom-api",
    }),
  );

  // Closed surface: no public registration or password-reset routes.
  app.all("/api/auth/register", (c) => {
    const failure = errorResponse("not_found", "Registration is not available.", { status: 404 });
    return c.json(failure.body, failure.status);
  });
  app.all("/api/auth/password-reset", (c) => {
    const failure = errorResponse("not_found", "Password reset is not available.", {
      status: 404,
    });
    return c.json(failure.body, failure.status);
  });

  if (env && auth) {
    mountAuthRoutes(app, { env, auth });
  }

  return app;
}
