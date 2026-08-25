export type ApiEnv = {
  nodeEnv: string;
  host: string;
  port: number;
  embedWorker: boolean;
};

function readPort(value: string | undefined): number {
  if (!value) {
    return 3000;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  return parsed;
}

export function loadApiEnv(env: NodeJS.ProcessEnv = process.env): ApiEnv {
  return {
    nodeEnv: env.NODE_ENV ?? "development",
    host: env.HOST ?? "0.0.0.0",
    port: readPort(env.PORT),
    embedWorker: env.FORGEROOM_EMBED_WORKER !== "false",
  };
}
