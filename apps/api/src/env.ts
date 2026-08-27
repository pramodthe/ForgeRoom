export type ApiEnv = {
  nodeEnv: string;
  host: string;
  port: number;
  embedWorker: boolean;
  appOrigin: string;
  sessionCookieName: string;
  sessionTtlSeconds: number;
  recentAuthWindowSeconds: number;
  loginRateLimitMax: number;
  loginRateLimitWindowMs: number;
  trustProxy: boolean;
  authStore: "memory" | "postgres";
  ownerUserId: string;
  ownerEmail: string;
  ownerDisplayName: string;
  ownerPasswordHash: string | null;
  ownerPassword: string | null;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  pausePayloadEncryptionSecret: string;
  composioApiKey: string | null;
  composioUserId: string | null;
  composioConnectedAccountId: string | null;
  composioAuthConfigId: string | null;
  composioBaseUrl: string | null;
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

function readPositiveInt(value: string | undefined, fallback: number, name: string): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function loadApiEnv(env: NodeJS.ProcessEnv = process.env): ApiEnv {
  if (env.AUTH_BYPASS === "true" && (env.NODE_ENV ?? "development") === "production") {
    throw new Error("AUTH_BYPASS is forbidden in production");
  }

  const nodeEnv = env.NODE_ENV ?? "development";
  const ownerPasswordHash = env.OWNER_PASSWORD_HASH?.trim() || null;
  const ownerPassword = env.OWNER_PASSWORD?.trim() || null;
  if (nodeEnv === "production" && ownerPassword) {
    throw new Error("OWNER_PASSWORD is forbidden in production; supply OWNER_PASSWORD_HASH");
  }
  if (nodeEnv === "production" && !ownerPasswordHash) {
    throw new Error("OWNER_PASSWORD_HASH is required in production");
  }

  const pausePayloadEncryptionSecret =
    env.PAUSE_PAYLOAD_ENCRYPTION_SECRET?.trim() ||
    (nodeEnv === "production"
      ? ""
      : env.OWNER_PASSWORD_HASH?.trim() ||
        env.OWNER_PASSWORD?.trim() ||
        "forgeroom-dev-pause-payload-secret");
  if (!pausePayloadEncryptionSecret) {
    throw new Error("PAUSE_PAYLOAD_ENCRYPTION_SECRET is required in production");
  }

  return {
    nodeEnv,
    host: env.HOST ?? "0.0.0.0",
    port: readPort(env.PORT),
    embedWorker: env.FORGEROOM_EMBED_WORKER !== "false",
    appOrigin: env.APP_ORIGIN ?? "http://localhost:5173",
    sessionCookieName: env.SESSION_COOKIE_NAME ?? "fr_session",
    sessionTtlSeconds: readPositiveInt(
      env.SESSION_TTL_SECONDS,
      60 * 60 * 12,
      "SESSION_TTL_SECONDS",
    ),
    recentAuthWindowSeconds: readPositiveInt(
      env.RECENT_AUTH_WINDOW_SECONDS,
      5 * 60,
      "RECENT_AUTH_WINDOW_SECONDS",
    ),
    loginRateLimitMax: readPositiveInt(env.LOGIN_RATE_LIMIT_MAX, 5, "LOGIN_RATE_LIMIT_MAX"),
    loginRateLimitWindowMs: readPositiveInt(
      env.LOGIN_RATE_LIMIT_WINDOW_MS,
      60_000,
      "LOGIN_RATE_LIMIT_WINDOW_MS",
    ),
    trustProxy: env.TRUST_PROXY === "true",
    authStore: env.AUTH_STORE === "memory" ? "memory" : "postgres",
    ownerUserId: env.OWNER_USER_ID ?? "user_owner",
    ownerEmail: (env.OWNER_EMAIL ?? "owner@example.test").toLowerCase(),
    ownerDisplayName: env.OWNER_DISPLAY_NAME ?? "Owner",
    ownerPasswordHash,
    ownerPassword: nodeEnv === "production" ? null : ownerPassword,
    workspaceId: env.WORKSPACE_ID ?? "workspace_1",
    workspaceName: env.WORKSPACE_NAME ?? "ForgeRoom",
    workspaceSlug: env.WORKSPACE_SLUG ?? "forgeroom",
    pausePayloadEncryptionSecret,
    composioApiKey: env.COMPOSIO_API_KEY?.trim() || null,
    composioUserId: env.COMPOSIO_USER_ID?.trim() || null,
    composioConnectedAccountId: env.COMPOSIO_CONNECTED_ACCOUNT_ID?.trim() || null,
    composioAuthConfigId: env.COMPOSIO_AUTH_CONFIG_ID?.trim() || null,
    composioBaseUrl: env.COMPOSIO_BASE_URL?.trim() || null,
  };
}
