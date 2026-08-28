import { serve } from "@hono/node-server";
import { assertAgUiStartupProfile } from "@forgeroom/ag-ui";
import { startWorker } from "@forgeroom/orchestration";
import { migrate } from "@forgeroom/db";
import { loadTrueForgeClientFromEnv } from "@forgeroom/trueforge";
import { loadApiEnv } from "./env";
import { createApiApp } from "./server";
import { createAuthService } from "./auth/service";
import { createDefaultAuthStore } from "./auth/postgres-store";
import { createDefaultWorkspaceStore } from "./workspace/postgres-store";
import { createWorkspaceService } from "./workspace/service";

export async function startApiProcess(env: NodeJS.ProcessEnv = process.env) {
  const config = loadApiEnv(env);
  const { store, sql, close } = createDefaultAuthStore({
    authStore: config.authStore,
    databaseUrl: env.DATABASE_URL && env.DATABASE_URL.length > 0 ? env.DATABASE_URL : undefined,
  });
  const auth = createAuthService({ env: config, store });
  const workspaceStore = createDefaultWorkspaceStore({ authStore: config.authStore, sql });
  const trueforgeClient =
    env.TRUEFORGE_BASE_URL && env.TRUEFORGE_BASE_URL.trim().length > 0
      ? loadTrueForgeClientFromEnv(env)
      : undefined;
  const workspace = createWorkspaceService({
    store: workspaceStore,
    ...(trueforgeClient ? { trueforgeClient } : {}),
    ...(sql ? { sql } : {}),
    apiEnv: config,
  });
  const app = createApiApp({
    env: config,
    auth,
    workspace,
    ...(trueforgeClient ? { trueforgeClient } : {}),
    ...(sql ? { sql } : {}),
  });
  let worker: ReturnType<typeof startWorker> | undefined;
  let server: ReturnType<typeof serve> | undefined;

  try {
    worker = config.embedWorker ? startWorker({ embedded: true }) : undefined;

    if (config.authStore === "postgres") {
      if (!sql) {
        throw new Error("Postgres auth store requires a SQL client");
      }
      await migrate(sql);
    }
    await auth.seedOwner();
    assertAgUiStartupProfile();

    server = serve({
      fetch: app.fetch,
      hostname: config.host,
      port: config.port,
    });
  } catch (error) {
    await worker?.stop();
    await close?.();
    throw error;
  }

  return {
    config,
    app,
    worker,
    auth,
    ready: Promise.resolve(),
    async stop() {
      const errors: unknown[] = [];
      try {
        await worker?.stop();
      } catch (error) {
        errors.push(error);
      }
      if (server) {
        try {
          await new Promise<void>((resolve, reject) => {
            server.close((closeError) => {
              if (closeError) {
                reject(closeError);
                return;
              }
              resolve();
            });
          });
        } catch (error) {
          errors.push(error);
        }
      }
      try {
        await close?.();
      } catch (error) {
        errors.push(error);
      }
      if (errors.length === 1) {
        throw errors[0];
      }
      if (errors.length > 1) {
        throw new AggregateError(errors, "API process stop failed");
      }
    },
  };
}
