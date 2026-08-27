import { describe, expect, it } from "vitest";
import { sessionResponseSchema } from "@forgeroom/contracts";
import { withMigratedDatabase } from "@forgeroom/db/test-harness";
import { P0_CONTROLLED_REGISTRY } from "@forgeroom/domain";
import { loadApiEnv } from "../env";
import { createApiApp } from "../server";
import { createAuthService } from "../auth/service";
import { createPostgresAuthStore } from "../auth/postgres-store";
import { createPostgresWorkspaceStore } from "../workspace/postgres-store";
import { createWorkspaceService } from "../workspace/service";
import { createComponentService } from "./service";

const PASSWORD = "correct-horse-battery";

function withoutRequestId(body: unknown): Record<string, unknown> {
  const record = (body ?? {}) as Record<string, unknown>;
  const { request_id: _requestId, ...rest } = record;
  return rest;
}

function cookieFrom(response: Response, name: string): string | undefined {
  const header = response.headers.get("set-cookie");
  if (!header) {
    return undefined;
  }
  const match = header.match(new RegExp(`${name}=([^;]+)`));
  return match?.[1];
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

describe("component registry API", () => {
  it("publishes the code-owned registry, grants agent tools, and refuses HITL grants", async () => {
    await withMigratedDatabase(async (sql) => {
      const env = loadApiEnv({
        NODE_ENV: "test",
        APP_ORIGIN: "http://localhost:5173",
        OWNER_EMAIL: "owner@example.test",
        OWNER_PASSWORD: PASSWORD,
        OWNER_USER_ID: "user_owner",
        OWNER_DISPLAY_NAME: "Owner",
        WORKSPACE_ID: "workspace_1",
        AUTH_STORE: "postgres",
      });
      const auth = createAuthService({ env, store: createPostgresAuthStore(sql) });
      const workspace = createWorkspaceService({
        store: createPostgresWorkspaceStore(sql),
        sql,
      });
      const components = createComponentService({ workspace, sql });
      await auth.seedOwner();
      const app = createApiApp({ env, auth, workspace, components, sql });
      const { session, cookie } = await login(app, env);

      const list = await app.request(`/api/workspaces/${env.workspaceId}/components`, {
        headers: { cookie: `${env.sessionCookieName}=${cookie}` },
      });
      expect(list.status).toBe(200);
      const listed = withoutRequestId(await list.json()) as {
        components: Array<{
          stable_name: string;
          offerable: boolean;
          descriptor_hash: string;
          id: string;
        }>;
      };
      expect(listed.components.map((row) => row.stable_name)).toEqual(
        [...P0_CONTROLLED_REGISTRY].map((row) => row.name),
      );
      expect(listed.components.filter((row) => row.offerable)).toHaveLength(5);

      const coworker = await workspace.seedCoworker({
        workspaceId: env.workspaceId,
        createdBy: env.ownerUserId,
        handle: "ops",
        name: "Ops",
        title: "Operator",
      });

      const dataTable = listed.components.find((row) => row.stable_name === "DataTable");
      expect(dataTable).toBeTruthy();
      const grant = await app.request(`/api/coworkers/${coworker.id}/component-grants`, {
        method: "POST",
        headers: mutationHeaders(env, cookie, session.csrf_token),
        body: JSON.stringify({
          granted: true,
          expected_component_version: "1.0.0",
          expected_descriptor_hash: dataTable!.descriptor_hash,
          idempotency_key: "grant-datatable-1",
        }),
      });
      expect(grant.status).toBe(200);
      const granted = withoutRequestId(await grant.json()) as {
        action: string;
        session_rotations: string[];
      };
      expect(granted.action).toBe("granted");

      const grants = await app.request(`/api/coworkers/${coworker.id}/component-grants`, {
        headers: { cookie: `${env.sessionCookieName}=${cookie}` },
      });
      expect(grants.status).toBe(200);
      const grantList = withoutRequestId(await grants.json()) as {
        components: Array<{ stable_name: string; granted: boolean }>;
      };
      expect(grantList.components.find((row) => row.stable_name === "DataTable")?.granted).toBe(
        true,
      );

      const approval = listed.components.find((row) => row.stable_name === "ApprovalCard");
      expect(approval).toBeTruthy();
      const hitl = await app.request(`/api/coworkers/${coworker.id}/component-grants`, {
        method: "POST",
        headers: mutationHeaders(env, cookie, session.csrf_token),
        body: JSON.stringify({
          granted: true,
          expected_component_version: "1.0.0",
          expected_descriptor_hash: approval!.descriptor_hash,
          idempotency_key: "grant-approval-1",
        }),
      });
      expect(hitl.status).toBe(403);

      const audits = await sql<{ action: string }[]>`
        SELECT action FROM audit_events
        WHERE workspace_id = ${env.workspaceId}
          AND action = 'component.grant'
      `;
      expect(audits.length).toBeGreaterThanOrEqual(1);
    });
  }, 60_000);

  it("replays grant mutations with the same idempotency key", async () => {
    await withMigratedDatabase(async (sql) => {
      const env = loadApiEnv({
        NODE_ENV: "test",
        APP_ORIGIN: "http://localhost:5173",
        OWNER_EMAIL: "owner@example.test",
        OWNER_PASSWORD: PASSWORD,
        OWNER_USER_ID: "user_owner",
        OWNER_DISPLAY_NAME: "Owner",
        WORKSPACE_ID: "workspace_1",
        AUTH_STORE: "postgres",
      });
      const auth = createAuthService({ env, store: createPostgresAuthStore(sql) });
      const workspace = createWorkspaceService({
        store: createPostgresWorkspaceStore(sql),
        sql,
      });
      const components = createComponentService({ workspace, sql });
      await auth.seedOwner();
      const app = createApiApp({ env, auth, workspace, components, sql });
      const { session, cookie } = await login(app, env);

      const list = await app.request(`/api/workspaces/${env.workspaceId}/components`, {
        headers: { cookie: `${env.sessionCookieName}=${cookie}` },
      });
      expect(list.status).toBe(200);
      const listed = withoutRequestId(await list.json()) as {
        components: Array<{ stable_name: string; descriptor_hash: string }>;
      };
      const dataTable = listed.components.find((row) => row.stable_name === "DataTable");
      expect(dataTable).toBeTruthy();

      const coworker = await workspace.seedCoworker({
        workspaceId: env.workspaceId,
        createdBy: env.ownerUserId,
        handle: "ops2",
        name: "Ops2",
        title: "Operator",
      });

      const body = {
        granted: true,
        expected_component_version: "1.0.0",
        expected_descriptor_hash: dataTable!.descriptor_hash,
        idempotency_key: "grant-datatable-replay",
      };
      const headers = mutationHeaders(env, cookie, session.csrf_token);

      const first = await app.request(`/api/coworkers/${coworker.id}/component-grants`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      expect(first.status).toBe(200);
      const firstBody = withoutRequestId(await first.json()) as {
        action: string;
        grant_id: string;
        session_rotations: string[];
      };
      expect(firstBody.action).toBe("granted");

      const second = await app.request(`/api/coworkers/${coworker.id}/component-grants`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      expect(second.status).toBe(200);
      const secondBody = withoutRequestId(await second.json()) as {
        action: string;
        grant_id: string;
        session_rotations: string[];
      };
      expect(secondBody).toEqual(firstBody);

      const auditCount = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM audit_events
        WHERE workspace_id = ${env.workspaceId}
          AND action = 'component.grant'
          AND redacted_payload_json->>'idempotency_key_hash' IS NOT NULL
          AND redacted_payload_json->>'coworker_id' = ${coworker.id}
      `;
      expect(Number(auditCount[0]?.count ?? 0)).toBeGreaterThanOrEqual(1);

      const approval = listed.components.find((row) => row.stable_name === "ApprovalCard");
      expect(approval).toBeTruthy();
      const hitl = await app.request(`/api/coworkers/${coworker.id}/component-grants`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          granted: true,
          expected_component_version: "1.0.0",
          expected_descriptor_hash: approval!.descriptor_hash,
          idempotency_key: "grant-approval-replay",
        }),
      });
      expect(hitl.status).toBe(403);
    });
  }, 60_000);
});
