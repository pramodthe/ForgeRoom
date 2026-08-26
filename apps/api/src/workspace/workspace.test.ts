import { describe, expect, it } from "vitest";
import {
  channelSchema,
  coworkerProfileSchema,
  errorEnvelopeSchema,
  sessionResponseSchema,
} from "@forgeroom/contracts";
import { withMigratedDatabase } from "@forgeroom/db/test-harness";
import { loadApiEnv } from "../env";
import { createApiApp } from "../server";
import { createAuthService } from "../auth/service";
import { createMemoryAuthStore } from "../auth/store";
import { createPostgresAuthStore } from "../auth/postgres-store";
import { createMemoryWorkspaceStore } from "./store";
import { createPostgresWorkspaceStore } from "./postgres-store";
import { createWorkspaceService } from "./service";

const PASSWORD = "correct-horse-battery";

async function createTestApp() {
  const authStore = createMemoryAuthStore();
  const workspaceStore = createMemoryWorkspaceStore();
  const env = loadApiEnv({
    NODE_ENV: "test",
    APP_ORIGIN: "http://localhost:5173",
    OWNER_EMAIL: "owner@example.test",
    OWNER_PASSWORD: PASSWORD,
    OWNER_USER_ID: "user_owner",
    OWNER_DISPLAY_NAME: "Owner",
    WORKSPACE_ID: "workspace_1",
    LOGIN_RATE_LIMIT_MAX: "20",
    LOGIN_RATE_LIMIT_WINDOW_MS: "60000",
    RECENT_AUTH_WINDOW_SECONDS: "300",
    SESSION_TTL_SECONDS: "3600",
  });
  const auth = createAuthService({ env, store: authStore });
  const workspace = createWorkspaceService({ store: workspaceStore });
  await auth.seedOwner();
  return {
    app: createApiApp({ env, auth, workspace }),
    env,
    auth,
    workspace,
    workspaceStore,
  };
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

describe("channel and coworker API", () => {
  it("creates, lists, opens, renames and archives channels", async () => {
    const { app, env } = await createTestApp();
    const { session, cookie } = await login(app, env);

    const created = await app.request(`/api/workspaces/${env.workspaceId}/channels`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        name: "Research",
        mission_brief: "Inspect the fixture",
        idempotency_key: "idem_channel_1",
      }),
    });
    expect(created.status).toBe(201);
    const channel = channelSchema.parse(await created.json());
    expect(channel.name).toBe("Research");
    expect(channel.status).toBe("active");

    const listed = await app.request(`/api/workspaces/${env.workspaceId}/channels`, {
      headers: { cookie: `${env.sessionCookieName}=${cookie}` },
    });
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({
      channels: [expect.objectContaining({ id: channel.id })],
    });

    const opened = await app.request(`/api/channels/${channel.id}`, {
      headers: { cookie: `${env.sessionCookieName}=${cookie}` },
    });
    expect(opened.status).toBe(200);
    expect(channelSchema.parse(await opened.json()).id).toBe(channel.id);

    const renamed = await app.request(`/api/channels/${channel.id}`, {
      method: "PATCH",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        name: "Research Lab",
        idempotency_key: "idem_channel_rename",
      }),
    });
    expect(renamed.status).toBe(200);
    expect(channelSchema.parse(await renamed.json()).name).toBe("Research Lab");

    const archived = await app.request(`/api/channels/${channel.id}/archive`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({ schemaVersion: 1, idempotency_key: "idem_channel_archive" }),
    });
    expect(archived.status).toBe(200);
    expect(channelSchema.parse(await archived.json()).status).toBe("archived");
  });

  it("rejects unauthenticated reads and CSRF-failed mutations", async () => {
    const { app, env } = await createTestApp();
    const unauth = await app.request(`/api/workspaces/${env.workspaceId}/channels`);
    expect(unauth.status).toBe(401);

    const { session, cookie } = await login(app, env);
    const forged = await app.request(`/api/workspaces/${env.workspaceId}/channels`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `${env.sessionCookieName}=${cookie}`,
        origin: "https://evil.example",
        "x-csrf-token": session.csrf_token,
      },
      body: JSON.stringify({
        schemaVersion: 1,
        name: "Nope",
        mission_brief: "",
        idempotency_key: "idem_evil",
      }),
    });
    expect(forged.status).toBe(403);
    expect(errorEnvelopeSchema.parse(await forged.json()).error.code).toBe("csrf_failed");
  });

  it("lists/gets/edits/disables coworkers and rejects direct create", async () => {
    const { app, env, workspace } = await createTestApp();
    const { session, cookie } = await login(app, env);
    await workspace.seedCoworker({
      workspaceId: env.workspaceId,
      createdBy: env.ownerUserId,
      handle: "analyst",
      name: "Analyst",
      title: "Evidence analyst",
      toolGrants: ["PROVIDER_READ_TOOL"],
    });

    const listed = await app.request(`/api/workspaces/${env.workspaceId}/coworkers`, {
      headers: { cookie: `${env.sessionCookieName}=${cookie}` },
    });
    expect(listed.status).toBe(200);
    const listBody = (await listed.json()) as { coworkers: unknown[] };
    expect(listBody.coworkers).toHaveLength(1);
    const coworker = coworkerProfileSchema.parse(listBody.coworkers[0]);

    const got = await app.request(`/api/coworkers/${coworker.id}`, {
      headers: { cookie: `${env.sessionCookieName}=${cookie}` },
    });
    expect(got.status).toBe(200);
    await expect(got.json()).resolves.toMatchObject({
      id: coworker.id,
      config: { tool_grants: ["PROVIDER_READ_TOOL"] },
    });

    const channelRes = await app.request(`/api/workspaces/${env.workspaceId}/channels`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        name: "Ops",
        mission_brief: "Operate",
        idempotency_key: "idem_ops",
      }),
    });
    const channel = channelSchema.parse(await channelRes.json());

    const edited = await app.request(`/api/coworkers/${coworker.id}`, {
      method: "PATCH",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        name: "Analyst Plus",
        handle: "analyst",
        title: "Evidence analyst",
        standing_instructions: "Verify sources.",
        model_preset: "default",
        native_subagents_enabled: false,
        channel_ids: [channel.id],
        budget: { max_turn_tokens: 8000, max_tool_calls: 10 },
        task_record_grants: [{ channel_id: channel.id, operations: ["create"] }],
        tool_grants: ["PROVIDER_READ_TOOL", "PROVIDER_WRITE_TOOL"],
        skill_version_ids: [],
        component_version_ids: [],
      }),
    });
    expect(edited.status).toBe(200);
    await expect(edited.json()).resolves.toMatchObject({
      coworker: { name: "Analyst Plus", config_revision: 2 },
      config: { tool_grants: ["PROVIDER_READ_TOOL", "PROVIDER_WRITE_TOOL"] },
    });

    const disabled = await app.request(`/api/coworkers/${coworker.id}/disable`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        expected_config_revision: 2,
        reason: "retired",
        idempotency_key: "idem_disable",
      }),
    });
    expect(disabled.status).toBe(200);
    expect(coworkerProfileSchema.parse(await disabled.json()).status).toBe("disabled");

    const createBlocked = await app.request(`/api/workspaces/${env.workspaceId}/coworkers`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({ name: "Nope" }),
    });
    expect(createBlocked.status).toBe(404);
    expect(errorEnvelopeSchema.parse(await createBlocked.json()).error.code).toBe("not_found");
  });

  it("validates membership, rejects coordinator role, and isolates grant edits", async () => {
    const { app, env, workspace, workspaceStore } = await createTestApp();
    const { session, cookie } = await login(app, env);
    const channelRes = await app.request(`/api/workspaces/${env.workspaceId}/channels`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        name: "Shared",
        mission_brief: "Share",
        idempotency_key: "idem_shared",
      }),
    });
    const channel = channelSchema.parse(await channelRes.json());
    const alpha = await workspace.seedCoworker({
      workspaceId: env.workspaceId,
      createdBy: env.ownerUserId,
      handle: "alpha",
      name: "Alpha",
      title: "A",
      toolGrants: ["ALPHA_TOOL"],
    });
    const beta = await workspace.seedCoworker({
      workspaceId: env.workspaceId,
      createdBy: env.ownerUserId,
      handle: "beta",
      name: "Beta",
      title: "B",
      toolGrants: ["BETA_TOOL"],
    });

    const coordinator = await app.request(`/api/channels/${channel.id}/participants`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        participant_type: "coworker",
        participant_id: alpha.id,
        role: "coordinator",
        idempotency_key: "idem_coord",
      }),
    });
    expect(coordinator.status).toBe(400);
    expect(errorEnvelopeSchema.parse(await coordinator.json()).error.details).toMatchObject({
      reason: "coordinator_unsupported",
    });

    const foreign = await app.request(`/api/channels/${channel.id}/participants`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        participant_type: "coworker",
        participant_id: "cw_missing",
        role: "member",
        idempotency_key: "idem_missing",
      }),
    });
    expect(foreign.status).toBe(400);

    const added = await app.request(`/api/channels/${channel.id}/participants`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        participant_type: "coworker",
        participant_id: alpha.id,
        role: "member",
        idempotency_key: "idem_add_alpha",
      }),
    });
    expect(added.status).toBe(200);

    await workspace.updateCoworker(session, beta.id, {
      name: "Beta",
      handle: "beta",
      title: "B",
      standing_instructions: "Stay put",
      model_preset: "default",
      native_subagents_enabled: false,
      channel_ids: [channel.id],
      budget: { max_turn_tokens: 1000, max_tool_calls: 5 },
      task_record_grants: [{ channel_id: channel.id, operations: ["create"] }],
      tool_grants: ["BETA_TOOL", "BETA_ONLY"],
      skill_version_ids: [],
      component_version_ids: [],
    });

    const removed = await app.request(`/api/channels/${channel.id}/participants/${alpha.id}`, {
      method: "DELETE",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({ schemaVersion: 1, idempotency_key: "idem_remove_alpha" }),
    });
    expect(removed.status).toBe(200);

    const betaAfter = await workspaceStore.getCoworker(beta.id);
    expect(betaAfter?.editableConfigJson.tool_grants).toEqual(["BETA_TOOL", "BETA_ONLY"]);
    const betaGrants = await workspaceStore.listActiveTaskGrantsForSubject(beta.id);
    expect(betaGrants).toHaveLength(1);
    expect(betaGrants[0]?.allowedOperationsJson).toEqual(["create"]);
  });

  it("blocks messages and participant edits on archived channels", async () => {
    const { app, env, workspace } = await createTestApp();
    const { session, cookie } = await login(app, env);
    const channelRes = await app.request(`/api/workspaces/${env.workspaceId}/channels`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        name: "Temp",
        mission_brief: "Temp",
        idempotency_key: "idem_temp",
      }),
    });
    const channel = channelSchema.parse(await channelRes.json());
    const coworker = await workspace.seedCoworker({
      workspaceId: env.workspaceId,
      createdBy: env.ownerUserId,
      handle: "ops",
      name: "Ops",
      title: "Operator",
    });

    await app.request(`/api/channels/${channel.id}/archive`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({ schemaVersion: 1, idempotency_key: "idem_arch" }),
    });

    const message = await app.request(`/api/channels/${channel.id}/messages`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        body: "hello",
        recipient_handles: [],
        routing_mode: "direct",
        parent_message_id: null,
      }),
    });
    expect(message.status).toBe(409);
    expect(errorEnvelopeSchema.parse(await message.json()).error.details).toMatchObject({
      reason: "channel_archived",
    });

    const participant = await app.request(`/api/channels/${channel.id}/participants`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        participant_type: "coworker",
        participant_id: coworker.id,
        role: "member",
        idempotency_key: "idem_arch_add",
      }),
    });
    expect(participant.status).toBe(409);
  });

  it("rejects cross-workspace channel and coworker access", async () => {
    const { app, env, workspace } = await createTestApp();
    const { cookie } = await login(app, env);
    const foreign = await workspace.seedCoworker({
      workspaceId: "workspace_other",
      createdBy: env.ownerUserId,
      handle: "foreign",
      name: "Foreign",
      title: "X",
    });
    const response = await app.request(`/api/coworkers/${foreign.id}`, {
      headers: { cookie: `${env.sessionCookieName}=${cookie}` },
    });
    expect(response.status).toBe(403);
  });
});

describe("channel and coworker postgres integration", () => {
  it("persists channel and coworker commands against migrated postgres", async () => {
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
      const workspace = createWorkspaceService({ store: createPostgresWorkspaceStore(sql) });
      await auth.seedOwner();
      const app = createApiApp({ env, auth, workspace });
      const { session, cookie } = await login(app, env);

      const created = await app.request(`/api/workspaces/${env.workspaceId}/channels`, {
        method: "POST",
        headers: mutationHeaders(env, cookie, session.csrf_token),
        body: JSON.stringify({
          schemaVersion: 1,
          name: "DB Channel",
          mission_brief: "Persist me",
          idempotency_key: "idem_db_channel",
        }),
      });
      expect(created.status).toBe(201);
      const channel = channelSchema.parse(await created.json());

      const coworker = await workspace.seedCoworker({
        workspaceId: env.workspaceId,
        createdBy: env.ownerUserId,
        handle: "dbops",
        name: "DB Ops",
        title: "Operator",
      });

      const added = await app.request(`/api/channels/${channel.id}/participants`, {
        method: "POST",
        headers: mutationHeaders(env, cookie, session.csrf_token),
        body: JSON.stringify({
          schemaVersion: 1,
          participant_type: "coworker",
          participant_id: coworker.id,
          role: "member",
          idempotency_key: "idem_db_add",
        }),
      });
      expect(added.status).toBe(200);

      const rows = await sql<{ participant_id: string }[]>`
        SELECT participant_id FROM channel_participants
        WHERE channel_id = ${channel.id}
          AND participant_type = 'coworker'
          AND removed_at IS NULL
      `;
      expect(rows.map((row) => row.participant_id)).toContain(coworker.id);

      await app.request(`/api/channels/${channel.id}/archive`, {
        method: "POST",
        headers: mutationHeaders(env, cookie, session.csrf_token),
        body: JSON.stringify({ schemaVersion: 1, idempotency_key: "idem_db_arch" }),
      });
      const blocked = await app.request(`/api/channels/${channel.id}/messages`, {
        method: "POST",
        headers: mutationHeaders(env, cookie, session.csrf_token),
        body: JSON.stringify({
          body: "nope",
          recipient_handles: [],
          routing_mode: "direct",
          parent_message_id: null,
        }),
      });
      expect(blocked.status).toBe(409);
    });
  }, 60_000);
});
