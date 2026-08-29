import { loadApiEnv } from "../env";
import { createApiApp } from "../server";
import { createAuthService } from "../auth/service";
import { createMemoryAuthStore } from "../auth/store";
import { createMemoryWorkspaceStore, type WorkspaceCatalogStore } from "./store";
import { createWorkspaceService } from "./service";

export const COWORKER_DRAFT_TEST_PASSWORD = "correct-horse-battery";

export async function createCoworkerDraftTestApp(
  store: WorkspaceCatalogStore = createMemoryWorkspaceStore(),
  options?: { workspaceId?: string; ownerUserId?: string },
) {
  const authStore = createMemoryAuthStore();
  const env = loadApiEnv({
    NODE_ENV: "test",
    APP_ORIGIN: "http://localhost:5173",
    OWNER_EMAIL: "owner@example.test",
    OWNER_PASSWORD: COWORKER_DRAFT_TEST_PASSWORD,
    OWNER_USER_ID: options?.ownerUserId ?? "user_owner",
    OWNER_DISPLAY_NAME: "Owner",
    WORKSPACE_ID: options?.workspaceId ?? "workspace_1",
    LOGIN_RATE_LIMIT_MAX: "20",
    LOGIN_RATE_LIMIT_WINDOW_MS: "60000",
    RECENT_AUTH_WINDOW_SECONDS: "300",
    SESSION_TTL_SECONDS: "3600",
  });
  const auth = createAuthService({ env, store: authStore });
  const workspace = createWorkspaceService({ store });
  await auth.seedOwner();
  return {
    app: createApiApp({ env, auth, workspace }),
    env,
    store,
    workspace,
  };
}

export function coworkerDraftMutationHeaders(
  env: ReturnType<typeof loadApiEnv>,
  cookie: string,
  csrf: string,
): Record<string, string> {
  return {
    "content-type": "application/json",
    cookie: `${env.sessionCookieName}=${cookie}`,
    origin: env.appOrigin,
    "x-csrf-token": csrf,
  };
}

export async function loginCoworkerDraftTestApp(
  app: ReturnType<typeof createApiApp>,
  env: ReturnType<typeof loadApiEnv>,
) {
  const response = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: "owner@example.test",
      password: COWORKER_DRAFT_TEST_PASSWORD,
    }),
  });
  const body = (await response.json()) as { csrf_token: string };
  const cookie = response.headers
    .get("set-cookie")
    ?.match(new RegExp(`${env.sessionCookieName}=([^;]+)`))?.[1];
  if (!cookie) {
    throw new Error("missing session cookie");
  }
  return { cookie, csrf: body.csrf_token };
}
