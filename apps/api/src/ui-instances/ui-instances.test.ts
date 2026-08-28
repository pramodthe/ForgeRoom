import { describe, expect, it } from "vitest";
import { uiInstanceReplayResponseSchema } from "@forgeroom/contracts";
import { seedRuntime, withMigratedDatabase } from "@forgeroom/db/test-harness";
import { createMemoryAuthStore } from "../auth/store";
import { createAuthService } from "../auth/service";
import { loadApiEnv } from "../env";
import { createApiApp } from "../server";
import { createPostgresWorkspaceStore } from "../workspace/postgres-store";
import { createWorkspaceService } from "../workspace/service";

const PASSWORD = "correct-horse-battery";

function cookieFrom(response: Response, name: string): string | undefined {
  const header = response.headers.get("set-cookie");
  if (!header) {
    return undefined;
  }
  const match = header.match(new RegExp(`${name}=([^;]+)`));
  return match?.[1];
}

describe("ui instance routes", () => {
  it("requires authentication for replay", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const env = loadApiEnv({
        NODE_ENV: "test",
        APP_ORIGIN: "http://localhost:5173",
        OWNER_EMAIL: "owner@example.test",
        OWNER_PASSWORD: PASSWORD,
        OWNER_USER_ID: "user_1",
        WORKSPACE_ID: "ws_1",
        AUTH_STORE: "memory",
      });
      const auth = createAuthService({ env, store: createMemoryAuthStore() });
      await auth.seedOwner();
      const workspace = createWorkspaceService({
        store: createPostgresWorkspaceStore(sql),
        sql,
      });
      const app = createApiApp({ env, auth, workspace, sql });
      const replay = await app.request("/api/ui-instances/ui_1");
      expect(replay.status).toBe(401);
    });
  });

  it("returns replay payload for seeded ui instance in the same workspace", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const env = loadApiEnv({
        NODE_ENV: "test",
        APP_ORIGIN: "http://localhost:5173",
        OWNER_EMAIL: "owner@example.test",
        OWNER_PASSWORD: PASSWORD,
        OWNER_USER_ID: "user_1",
        WORKSPACE_ID: "ws_1",
        AUTH_STORE: "memory",
        SESSION_COOKIE_NAME: "fr_session",
      });
      const auth = createAuthService({ env, store: createMemoryAuthStore() });
      await auth.seedOwner();
      const workspace = createWorkspaceService({
        store: createPostgresWorkspaceStore(sql),
        sql,
      });
      const app = createApiApp({ env, auth, workspace, sql });

      const login = await app.request("/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:5173",
        },
        body: JSON.stringify({ email: "owner@example.test", password: PASSWORD }),
      });
      const cookie = cookieFrom(login, env.sessionCookieName);
      expect(cookie).toBeTruthy();

      const replay = await app.request("/api/ui-instances/ui_1", {
        headers: { cookie: `${env.sessionCookieName}=${cookie}` },
      });
      expect(replay.status).toBe(200);
      const body = uiInstanceReplayResponseSchema.parse(await replay.json());
      expect(body).toMatchObject({
        instanceId: "ui_1",
        workspaceId: "ws_1",
        channelId: "ch_1",
        runId: "run_1",
        runStepId: "step_1",
        componentName: "DataTable",
        status: "building",
        interactionEnabled: false,
        textAlternative: "A table of results",
      });
      expect(body.renderGrant).toMatchObject({
        id: "rg_1",
        rail: "registry_v1",
        allowedComponentTypes: ["table"],
        revoked: false,
      });
      // The fixture is an uncommitted building instance and the action row
      // does not contain a canonical ActionGrant body. Replay must not expose
      // an unverifiable grant, even though the database row exists.
      expect(body.actionGrants).toHaveLength(0);
    });
  });

  it("returns 404 for unknown ui instance", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const env = loadApiEnv({
        NODE_ENV: "test",
        APP_ORIGIN: "http://localhost:5173",
        OWNER_EMAIL: "owner@example.test",
        OWNER_PASSWORD: PASSWORD,
        OWNER_USER_ID: "user_1",
        WORKSPACE_ID: "ws_1",
        AUTH_STORE: "memory",
        SESSION_COOKIE_NAME: "fr_session",
      });
      const auth = createAuthService({ env, store: createMemoryAuthStore() });
      await auth.seedOwner();
      const workspace = createWorkspaceService({
        store: createPostgresWorkspaceStore(sql),
        sql,
      });
      const app = createApiApp({ env, auth, workspace, sql });

      const login = await app.request("/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:5173",
        },
        body: JSON.stringify({ email: "owner@example.test", password: PASSWORD }),
      });
      const cookie = cookieFrom(login, env.sessionCookieName);

      const replay = await app.request("/api/ui-instances/ui_missing", {
        headers: { cookie: `${env.sessionCookieName}=${cookie}` },
      });
      expect(replay.status).toBe(404);
    });
  });
});
