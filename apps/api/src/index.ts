import { serve } from "@hono/node-server";
import { startWorker } from "@forgeroom/orchestration";
import { databaseUrl, migrate } from "@forgeroom/db";
import { loadApiEnv } from "./env";
import { createApiApp } from "./server";
import { createAuthService } from "./auth/service";
import { createDefaultAuthStore } from "./auth/postgres-store";

export async function startApiProcess(env: NodeJS.ProcessEnv = process.env) {
  const config = loadApiEnv(env);
  const { store, sql, close } = createDefaultAuthStore({
    authStore: config.authStore,
    databaseUrl: databaseUrl(),
  });
  const auth = createAuthService({ env: config, store });
  const app = createApiApp({ env: config, auth });
  const worker = config.embedWorker ? startWorker({ embedded: true }) : undefined;

  if (config.authStore === "postgres") {
    if (!sql) {
      throw new Error("Postgres auth store requires a SQL client");
    }
    await migrate(sql);
  }
  await auth.seedOwner();

  const server = serve({
    fetch: app.fetch,
    hostname: config.host,
    port: config.port,
  });

  return {
    config,
    app,
    worker,
    auth,
    ready: Promise.resolve(),
    async stop() {
      await worker?.stop();
      await close?.();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}
