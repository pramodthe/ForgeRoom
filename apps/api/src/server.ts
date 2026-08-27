import { Hono } from "hono";
import type { ApiEnv } from "./env";
import { createAuthService, type AuthService } from "./auth/service";
import { mountAuthRoutes } from "./auth/routes";
import { mountAgUiRoutes } from "./ag-ui/routes";
import { errorResponse } from "./http";
import { createWorkspaceService, type WorkspaceService } from "./workspace/service";
import { mountWorkspaceRoutes } from "./workspace/routes";
import { createComponentService, type ComponentService } from "./components/service";
import { mountComponentRoutes } from "./components/routes";
import type { createSql } from "@forgeroom/db";
import type { TrueForgeClient } from "@forgeroom/trueforge";

export function createApiApp(options?: {
  env?: ApiEnv;
  auth?: AuthService;
  workspace?: WorkspaceService;
  components?: ComponentService;
  trueforgeClient?: TrueForgeClient;
  sql?: ReturnType<typeof createSql>;
}) {
  const app = new Hono();
  const env = options?.env;
  const auth = options?.auth ?? (env ? createAuthService({ env }) : undefined);
  const workspace = options?.workspace ?? (env && auth ? createWorkspaceService() : undefined);
  const components =
    options?.components ??
    (workspace
      ? createComponentService({
          workspace,
          ...(options?.sql ? { sql: options.sql } : {}),
        })
      : undefined);

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
  app.all("/api/copilotkit", (c) => {
    const failure = errorResponse("not_found", "CopilotKit gateway is disabled in P0.", {
      status: 404,
    });
    return c.json(failure.body, failure.status);
  });

  if (env && auth) {
    mountAuthRoutes(app, { env, auth });
  }
  if (env && auth && workspace) {
    mountWorkspaceRoutes(app, { env, auth, workspace });
    if (components) {
      mountComponentRoutes(app, { env, auth, components });
    }
    mountAgUiRoutes(app, {
      env,
      auth,
      workspace,
      ...(options?.trueforgeClient ? { trueforgeClient: options.trueforgeClient } : {}),
      ...(options?.sql ? { sql: options.sql } : {}),
    });
  }

  return app;
}
