import { Hono } from "hono";
import type { ApiEnv } from "./env";
import { createAuthService, type AuthService } from "./auth/service";
import { mountAuthRoutes } from "./auth/routes";
import { mountAgUiRoutes } from "./ag-ui/routes";
import { errorResponse } from "./http";
import { createWorkspaceService, type WorkspaceService } from "./workspace/service";
import { mountWorkspaceRoutes } from "./workspace/routes";
import { createComponentService, type ComponentService } from "./components/service";
import { rotateComponentGrantSessions } from "./components/grant-rotation";
import { mountComponentRoutes } from "./components/routes";
import { createPostgresWorkspaceStore } from "./workspace/postgres-store";
import { createApprovalService, type ApprovalService } from "./approvals/service";
import { mountApprovalRoutes } from "./approvals/routes";
import { createQuestionService, type QuestionService } from "./questions/service";
import { mountQuestionRoutes } from "./questions/routes";
import { createConnectionService, type ConnectionService } from "./connections/service";
import { mountConnectionRoutes } from "./connections/routes";
import { createArtifactServiceFromEnv, type ArtifactService } from "./artifacts/service";
import { mountArtifactRoutes } from "./artifacts/routes";
import { createUiInstanceService, type UiInstanceService } from "./ui-instances/service";
import { mountUiInstanceRoutes } from "./ui-instances/routes";
import { mountUiComponentsMcpRoutes } from "./mcp/ui-components-routes";
import type { createSql } from "@forgeroom/db";
import type { TrueForgeClient } from "@forgeroom/trueforge";

export function createApiApp(options?: {
  env?: ApiEnv;
  auth?: AuthService;
  workspace?: WorkspaceService;
  components?: ComponentService;
  approvals?: ApprovalService;
  questions?: QuestionService;
  connections?: ConnectionService;
  artifacts?: ArtifactService;
  uiInstances?: UiInstanceService;
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
          ...(options?.sql && options.trueforgeClient
            ? {
                rotateGrantSessions: async (input) => {
                  const sql = options.sql!;
                  const store = createPostgresWorkspaceStore(sql);
                  await rotateComponentGrantSessions({
                    sql,
                    store,
                    client: options.trueforgeClient!,
                    workspaceId: input.workspaceId,
                    coworkerId: input.coworkerId,
                    sessionIds: input.sessionIds,
                    createdBy: input.createdBy,
                    reason: input.granted ? "component_grant" : "component_revoke",
                    operationId: input.operationId,
                    operationStartedAt: input.operationStartedAt,
                    reconcile: input.reconcile,
                    ...(env ? { apiEnv: env } : {}),
                  });
                },
              }
            : {}),
        })
      : undefined);
  const approvals =
    options?.approvals ??
    (env && options?.sql ? createApprovalService({ env, sql: options.sql }) : undefined);
  const questions =
    options?.questions ??
    (env && options?.sql ? createQuestionService({ env, sql: options.sql }) : undefined);
  const connections =
    options?.connections ??
    (env
      ? createConnectionService({
          env,
          ...(options?.sql ? { sql: options.sql } : {}),
        })
      : undefined);
  const artifacts =
    options?.artifacts ??
    (env && workspace
      ? createArtifactServiceFromEnv({
          env,
          workspace,
          ...(options?.sql ? { sql: options.sql } : {}),
        })
      : undefined);
  const uiInstances =
    options?.uiInstances ??
    (workspace && auth && env
      ? createUiInstanceService({
          workspace,
          auth,
          interactionTokenSecret: env.pausePayloadEncryptionSecret,
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
    if (approvals) {
      mountApprovalRoutes(app, { env, auth, approvals });
    }
    if (questions) {
      mountQuestionRoutes(app, { env, auth, questions });
    }
    if (connections) {
      mountConnectionRoutes(app, { env, auth, connections });
    }
    if (artifacts) {
      mountArtifactRoutes(app, { env, auth, artifacts });
    }
    if (uiInstances) {
      mountUiInstanceRoutes(app, { env, auth, uiInstances });
    }
    mountAgUiRoutes(app, {
      env,
      auth,
      workspace,
      ...(options?.trueforgeClient ? { trueforgeClient: options.trueforgeClient } : {}),
      ...(options?.sql ? { sql: options.sql } : {}),
      ...(artifacts ? { artifacts } : {}),
    });
    if (options?.sql && workspace) {
      mountUiComponentsMcpRoutes(app, { env, sql: options.sql, workspace });
    }
  }

  return app;
}
