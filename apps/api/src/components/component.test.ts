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

      const reusedForOppositeGrant = await app.request(
        `/api/coworkers/${coworker.id}/component-grants`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ ...body, granted: false }),
        },
      );
      expect(reusedForOppositeGrant.status).toBe(409);
      expect(withoutRequestId(await reusedForOppositeGrant.json())).toMatchObject({
        error: { details: { reason: "idempotency_key_reuse" } },
      });

      const artifactCard = listed.components.find((row) => row.stable_name === "ArtifactCard");
      expect(artifactCard).toBeTruthy();
      const reusedForDifferentComponent = await app.request(
        `/api/coworkers/${coworker.id}/component-grants`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            ...body,
            expected_descriptor_hash: artifactCard!.descriptor_hash,
          }),
        },
      );
      expect(reusedForDifferentComponent.status).toBe(409);
      expect(withoutRequestId(await reusedForDifferentComponent.json())).toMatchObject({
        error: { details: { reason: "idempotency_key_reuse" } },
      });

      const noopBody = { ...body, idempotency_key: "grant-datatable-noop-replay" };
      const noop = await app.request(`/api/coworkers/${coworker.id}/component-grants`, {
        method: "POST",
        headers,
        body: JSON.stringify(noopBody),
      });
      expect(noop.status).toBe(200);
      const noopResult = withoutRequestId(await noop.json()) as { action: string };
      expect(noopResult.action).toBe("noop");

      const revoke = await app.request(`/api/coworkers/${coworker.id}/component-grants`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...body,
          granted: false,
          idempotency_key: "revoke-datatable-after-noop",
        }),
      });
      expect(revoke.status).toBe(200);

      const noopReplayAfterStateChange = await app.request(
        `/api/coworkers/${coworker.id}/component-grants`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(noopBody),
        },
      );
      expect(noopReplayAfterStateChange.status).toBe(200);
      expect(withoutRequestId(await noopReplayAfterStateChange.json())).toEqual(noopResult);

      const grantsAfterReplay = await app.request(
        `/api/coworkers/${coworker.id}/component-grants`,
        { headers: { cookie: `${env.sessionCookieName}=${cookie}` } },
      );
      const grantsAfterReplayBody = withoutRequestId(await grantsAfterReplay.json()) as {
        components: Array<{ stable_name: string; granted: boolean }>;
      };
      expect(
        grantsAfterReplayBody.components.find((row) => row.stable_name === "DataTable")?.granted,
      ).toBe(false);

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

  it("retries only unfinished session rotations after a partial provider failure", async () => {
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
      const workspaceStore = createPostgresWorkspaceStore(sql);
      const workspace = createWorkspaceService({ store: workspaceStore, sql });
      const rotationCalls: string[] = [];
      const reconciliationCalls: boolean[] = [];
      let failSecondRotation = true;
      const components = createComponentService({
        workspace,
        sql,
        rotateGrantSessions: async ({ sessionIds, reconcile }) => {
          expect(sessionIds).toHaveLength(1);
          rotationCalls.push(sessionIds[0]!);
          reconciliationCalls.push(reconcile);
          if (rotationCalls.length === 2 && failSecondRotation) {
            failSecondRotation = false;
            throw new Error("simulated second-session provider failure");
          }
        },
      });
      await auth.seedOwner();
      const app = createApiApp({ env, auth, workspace, components, sql });
      const { session, cookie } = await login(app, env);
      const headers = mutationHeaders(env, cookie, session.csrf_token);

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
        handle: "rotation-retry",
        name: "Rotation Retry",
        title: "Operator",
      });
      const channelIds: string[] = [];
      for (const [index, name] of ["Rotation A", "Rotation B"].entries()) {
        const response = await app.request(`/api/workspaces/${env.workspaceId}/channels`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            schemaVersion: 1,
            name,
            mission_brief: `${name} mission`,
            idempotency_key: `component-rotation-channel-${index}`,
          }),
        });
        expect(response.status).toBe(201);
        const body = withoutRequestId(await response.json());
        expect(typeof body.id).toBe("string");
        channelIds.push(body.id as string);
      }
      await Promise.all(
        channelIds.map((channelId, index) =>
          workspaceStore.upsertChannelAgentSession({
            id: `cas_component_rotation_${index}`,
            workspaceId: env.workspaceId,
            channelId,
            agentProfileId: coworker.id,
            state: "active",
          }),
        ),
      );

      const grantBody = JSON.stringify({
        granted: true,
        expected_component_version: "1.0.0",
        expected_descriptor_hash: dataTable!.descriptor_hash,
        idempotency_key: "grant-datatable-partial-rotation-retry",
      });
      const first = await app.request(`/api/coworkers/${coworker.id}/component-grants`, {
        method: "POST",
        headers,
        body: grantBody,
      });
      expect(first.status).toBe(503);
      expect(withoutRequestId(await first.json())).toMatchObject({
        error: {
          details: { message: "simulated second-session provider failure" },
        },
      });
      expect(rotationCalls).toHaveLength(2);
      expect(reconciliationCalls).toEqual([false, false]);
      const completedSessionId = rotationCalls[0]!;
      const failedSessionId = rotationCalls[1]!;
      expect(completedSessionId).not.toBe(failedSessionId);

      const retry = await app.request(`/api/coworkers/${coworker.id}/component-grants`, {
        method: "POST",
        headers,
        body: grantBody,
      });
      expect(retry.status).toBe(200);
      expect(rotationCalls).toEqual([completedSessionId, failedSessionId, failedSessionId]);
      expect(reconciliationCalls).toEqual([false, false, true]);

      const replay = await app.request(`/api/coworkers/${coworker.id}/component-grants`, {
        method: "POST",
        headers,
        body: grantBody,
      });
      expect(replay.status).toBe(200);
      expect(rotationCalls).toEqual([completedSessionId, failedSessionId, failedSessionId]);
      expect(reconciliationCalls).toEqual([false, false, true]);

      const rotationAudits = await sql<
        { target_id: string; redacted_payload_json: Record<string, unknown> }[]
      >`
        SELECT target_id, redacted_payload_json
        FROM audit_events
        WHERE workspace_id = ${env.workspaceId}
          AND action = 'component.session_rotation_applied'
          AND redacted_payload_json->>'coworker_id' = ${coworker.id}
        ORDER BY created_at ASC
      `;
      expect(rotationAudits.map((audit) => audit.target_id)).toEqual([
        completedSessionId,
        failedSessionId,
      ]);
      expect(
        rotationAudits.every(
          (audit) => typeof audit.redacted_payload_json.grant_audit_id === "string",
        ),
      ).toBe(true);

      const startedRotationAudits = await sql<{ target_id: string }[]>`
        SELECT target_id
        FROM audit_events
        WHERE workspace_id = ${env.workspaceId}
          AND action = 'component.session_rotation_started'
          AND redacted_payload_json->>'coworker_id' = ${coworker.id}
        ORDER BY created_at ASC
      `;
      expect(startedRotationAudits.map((audit) => audit.target_id)).toEqual([
        completedSessionId,
        failedSessionId,
      ]);
    });
  }, 60_000);
});
