import { serve } from "@hono/node-server";
import { startWorker } from "@forgeroom/orchestration";
import { loadApiEnv } from "./env";
import { createApiApp } from "./server";

export function startApiProcess(env: NodeJS.ProcessEnv = process.env) {
  const config = loadApiEnv(env);
  const app = createApiApp();
  const worker = config.embedWorker ? startWorker({ embedded: true }) : undefined;

  const server = serve({
    fetch: app.fetch,
    hostname: config.host,
    port: config.port,
  });

  return {
    config,
    app,
    worker,
    async stop() {
      await worker?.stop();
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
