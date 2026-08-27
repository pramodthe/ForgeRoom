import { describe, expect, it } from "vitest";
import {
  P0_COMPOSIO_CONNECTION_ID,
  P0_COMPOSIO_DESCRIPTOR_HASHES,
  P0_COMPOSIO_READ_TOOL,
  type ComposioSessionClient,
} from "@forgeroom/composio";
import { sessionResponseSchema } from "@forgeroom/contracts";
import { seedRuntime, withMigratedDatabase } from "@forgeroom/db/test-harness";
import { loadApiEnv } from "../env";
import { createApiApp } from "../server";
import { createAuthService } from "../auth/service";
import { createPostgresAuthStore } from "../auth/postgres-store";
import { createPostgresWorkspaceStore } from "../workspace/postgres-store";
import { createWorkspaceService } from "../workspace/service";
import { createConnectionService } from "./service";

const PASSWORD = "correct-horse-battery";
const PINNED = "ca_xxxxnizY";

function cookieFrom(response: Response, name: string): string | undefined {
  const header = response.headers.get("set-cookie");
  if (!header) return undefined;
  const match = header.match(new RegExp(`${name}=([^;]+)`));
  return match?.[1];
}

function mutationHeaders(
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

async function login(app: ReturnType<typeof createApiApp>, env: ReturnType<typeof loadApiEnv>) {
  const response = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "owner@example.test", password: PASSWORD }),
  });
  expect(response.status).toBe(200);
  const session = sessionResponseSchema.parse(await response.json());
  const cookie = cookieFrom(response, env.sessionCookieName);
  expect(cookie).toBeTruthy();
  return { session, cookie: cookie! };
}

function mockComposio(overrides?: {
  accountStatus?: string;
  provisionalAccountId?: string | null;
}): ComposioSessionClient {
  const status = overrides?.accountStatus ?? "ACTIVE";
  const client = {
    pinnedConnectedAccountId: PINNED,
    composioUserId: "forgeroom_workspace_1",
    async getConnectedAccountDetails() {
      return {
        id: PINNED,
        status,
        isDisabled: false,
        toolkitSlug: "github",
        scopes: ["repo", "user"],
        authConfigId: "ac_test",
      };
    },
    async getConnectedAccount() {
      const details = await this.getConnectedAccountDetails();
      return {
        id: details.id,
        status: details.status,
        isDisabled: details.isDisabled,
        toolkitSlug: details.toolkitSlug,
      };
    },
    async executeDirectTool() {
      return {
        toolSlug: P0_COMPOSIO_READ_TOOL,
        httpStatus: 200,
        raw: { successful: true, data: { title: "ok" } },
        successful: true,
        authFailure: status.toUpperCase().includes("EXPIR"),
      };
    },
    async createConnectLink() {
      return {
        linkToken: "lt_test",
        redirectUrl: "https://connect.composio.dev/link/test",
        expiresAt: "2099-01-01T00:00:00.000Z",
        provisionalConnectedAccountId: overrides?.provisionalAccountId ?? "ca_provisionalOther",
      };
    },
  };
  return client as unknown as ComposioSessionClient;
}

describe("P0-304 connections API", () => {
  it("requires auth and CSRF; returns status/test/reconnect; rejects catalog and wrong workspace", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const env = loadApiEnv({
        NODE_ENV: "test",
        OWNER_PASSWORD: PASSWORD,
        OWNER_USER_ID: "user_1",
        OWNER_EMAIL: "owner@example.test",
        OWNER_DISPLAY_NAME: "Owner",
        WORKSPACE_ID: "ws_1",
        APP_ORIGIN: "http://localhost:5173",
        AUTH_STORE: "postgres",
        COMPOSIO_API_KEY: "ck_test",
        COMPOSIO_USER_ID: "forgeroom_workspace_1",
        COMPOSIO_CONNECTED_ACCOUNT_ID: PINNED,
        COMPOSIO_AUTH_CONFIG_ID: "ac_test",
      });
      const authStore = createPostgresAuthStore(sql);
      const auth = createAuthService({ env, store: authStore });
      await auth.seedOwner();
      const workspace = createWorkspaceService({
        store: createPostgresWorkspaceStore(sql),
      });
      const connections = createConnectionService({
        env,
        sql,
        composio: mockComposio(),
      });
      const app = createApiApp({ env, auth, workspace, connections, sql });

      const unauth = await app.request(`/api/workspaces/${env.workspaceId}/connections`);
      expect(unauth.status).toBe(401);

      const { session, cookie } = await login(app, env);

      const catalog = await app.request("/api/connections/catalog", {
        headers: { cookie: `${env.sessionCookieName}=${cookie}` },
      });
      expect(catalog.status).toBe(404);

      const wrongWs = await app.request(`/api/workspaces/workspace_other/connections`, {
        headers: { cookie: `${env.sessionCookieName}=${cookie}` },
      });
      expect(wrongWs.status).toBe(403);

      const list = await app.request(`/api/workspaces/${env.workspaceId}/connections`, {
        headers: { cookie: `${env.sessionCookieName}=${cookie}` },
      });
      expect(list.status).toBe(200);
      const listed = (await list.json()) as {
        connections: Array<{ id: string; status: string }>;
      };
      expect(listed.connections).toHaveLength(1);
      expect(listed.connections[0]?.id).toBe(P0_COMPOSIO_CONNECTION_ID);
      expect(listed.connections[0]?.status).toBe("active");

      const status = await app.request(`/api/connections/${P0_COMPOSIO_CONNECTION_ID}/status`, {
        headers: { cookie: `${env.sessionCookieName}=${cookie}` },
      });
      expect(status.status).toBe(200);
      const statusBody = (await status.json()) as {
        connection: {
          scopes: string[];
          tools: Array<{ tool_name: string; descriptor_hash: string }>;
          catalog_browse_allowed: boolean;
          account_selection_allowed: boolean;
          blocks_dispatch: boolean;
          verified_at: string;
        };
      };
      expect(statusBody.connection.scopes).toEqual(["repo", "user"]);
      expect(statusBody.connection.tools.length).toBeGreaterThanOrEqual(2);
      expect(statusBody.connection.catalog_browse_allowed).toBe(false);
      expect(statusBody.connection.account_selection_allowed).toBe(false);
      expect(statusBody.connection.blocks_dispatch).toBe(false);
      expect(statusBody.connection.verified_at).toBeTruthy();

      const noCsrf = await app.request(`/api/connections/${P0_COMPOSIO_CONNECTION_ID}/test`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${env.sessionCookieName}=${cookie}`,
          origin: env.appOrigin,
        },
        body: JSON.stringify({
          schemaVersion: 1,
          expected_connection_id: P0_COMPOSIO_CONNECTION_ID,
          expected_descriptor_hash: `sha256:${P0_COMPOSIO_DESCRIPTOR_HASHES[P0_COMPOSIO_READ_TOOL]}`,
          idempotency_key: "test-1",
        }),
      });
      expect(noCsrf.status).toBe(403);

      const testOk = await app.request(`/api/connections/${P0_COMPOSIO_CONNECTION_ID}/test`, {
        method: "POST",
        headers: mutationHeaders(env, cookie, session.csrf_token),
        body: JSON.stringify({
          schemaVersion: 1,
          expected_connection_id: P0_COMPOSIO_CONNECTION_ID,
          expected_descriptor_hash: `sha256:${P0_COMPOSIO_DESCRIPTOR_HASHES[P0_COMPOSIO_READ_TOOL]}`,
          idempotency_key: "test-1",
        }),
      });
      expect(testOk.status).toBe(200);
      const testBody = (await testOk.json()) as { ok: boolean; checked_tool: string };
      expect(testBody.ok).toBe(true);
      expect(testBody.checked_tool).toBe(P0_COMPOSIO_READ_TOOL);

      const reconnect = await app.request(
        `/api/connections/${P0_COMPOSIO_CONNECTION_ID}/reconnect`,
        {
          method: "POST",
          headers: mutationHeaders(env, cookie, session.csrf_token),
          body: JSON.stringify({
            schemaVersion: 1,
            expected_connection_id: P0_COMPOSIO_CONNECTION_ID,
            expected_status: "active",
            idempotency_key: "reconnect-1",
          }),
        },
      );
      expect(reconnect.status).toBe(200);
      const reconnectBody = (await reconnect.json()) as {
        redirect_url: string;
        workspace_bound: boolean;
        intent_id: string;
      };
      expect(reconnectBody.redirect_url).toMatch(/^https:\/\//);
      expect(reconnectBody.workspace_bound).toBe(true);

      const reconnectStatus = await app.request(
        `/api/connections/${P0_COMPOSIO_CONNECTION_ID}/reconnect/status`,
        { headers: { cookie: `${env.sessionCookieName}=${cookie}` } },
      );
      expect(reconnectStatus.status).toBe(200);
      const rs = (await reconnectStatus.json()) as {
        reconnect_state: string;
        fallback_account_rejected: boolean;
      };
      expect(["pending", "completed", "identity_mismatch"]).toContain(rs.reconnect_state);
      expect(rs.fallback_account_rejected).toBe(true);
    });
  }, 60_000);

  it("maps expired account to blocked_connection without fallback", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const env = loadApiEnv({
        NODE_ENV: "test",
        OWNER_PASSWORD: PASSWORD,
        OWNER_USER_ID: "user_1",
        OWNER_EMAIL: "owner@example.test",
        OWNER_DISPLAY_NAME: "Owner",
        WORKSPACE_ID: "ws_1",
        APP_ORIGIN: "http://localhost:5173",
        AUTH_STORE: "postgres",
        COMPOSIO_API_KEY: "ck_test",
        COMPOSIO_USER_ID: "forgeroom_workspace_1",
        COMPOSIO_CONNECTED_ACCOUNT_ID: PINNED,
        COMPOSIO_AUTH_CONFIG_ID: "ac_test",
      });
      const authStore = createPostgresAuthStore(sql);
      const auth = createAuthService({ env, store: authStore });
      await auth.seedOwner();
      const workspace = createWorkspaceService({
        store: createPostgresWorkspaceStore(sql),
      });
      const connections = createConnectionService({
        env,
        sql,
        composio: mockComposio({ accountStatus: "EXPIRED" }),
      });
      const app = createApiApp({ env, auth, workspace, connections, sql });
      const { cookie } = await login(app, env);

      const status = await app.request(`/api/connections/${P0_COMPOSIO_CONNECTION_ID}/status`, {
        headers: { cookie: `${env.sessionCookieName}=${cookie}` },
      });
      expect(status.status).toBe(200);
      const body = (await status.json()) as {
        connection: {
          status: string;
          blocks_dispatch: boolean;
          run_step_state: string | null;
        };
      };
      expect(body.connection.status).toBe("expired");
      expect(body.connection.blocks_dispatch).toBe(true);
      expect(body.connection.run_step_state).toBe("blocked_connection");
    });
  }, 60_000);
});
