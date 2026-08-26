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
import { createWorkspaceService, IDEMPOTENCY_CLAIM_LEASE_MS } from "./service";

const PASSWORD = "correct-horse-battery";

function withoutRequestId(body: unknown): Record<string, unknown> {
  const record = (body ?? {}) as Record<string, unknown>;
  const { request_id: _requestId, ...rest } = record;
  return rest;
}

async function createTestApp(options?: { now?: () => Date }) {
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
  const workspace = createWorkspaceService({ store: workspaceStore, now: options?.now });
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
    const createdBody = (await created.json()) as Record<string, unknown>;
    expect(typeof createdBody.request_id).toBe("string");
    expect(String(createdBody.request_id).startsWith("req_")).toBe(true);
    const channel = channelSchema.parse(withoutRequestId(createdBody));
    expect(channel.name).toBe("Research");
    expect(channel.status).toBe("active");

    const listed = await app.request(`/api/workspaces/${env.workspaceId}/channels`, {
      headers: { cookie: `${env.sessionCookieName}=${cookie}` },
    });
    expect(listed.status).toBe(200);
    await expect(listed.json()).resolves.toMatchObject({
      request_id: expect.stringMatching(/^req_/),
      channels: [expect.objectContaining({ id: channel.id })],
    });

    const opened = await app.request(`/api/channels/${channel.id}`, {
      headers: { cookie: `${env.sessionCookieName}=${cookie}` },
    });
    expect(opened.status).toBe(200);
    expect(channelSchema.parse(withoutRequestId(await opened.json())).id).toBe(channel.id);

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
    expect(channelSchema.parse(withoutRequestId(await renamed.json())).name).toBe("Research Lab");

    const archived = await app.request(`/api/channels/${channel.id}/archive`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({ schemaVersion: 1, idempotency_key: "idem_channel_archive" }),
    });
    expect(archived.status).toBe(200);
    expect(channelSchema.parse(withoutRequestId(await archived.json())).status).toBe("archived");
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
    const listBody = (await listed.json()) as { coworkers: unknown[]; request_id: string };
    expect(typeof listBody.request_id).toBe("string");
    expect(listBody.request_id.startsWith("req_")).toBe(true);
    expect(listBody.coworkers).toHaveLength(1);
    const coworker = coworkerProfileSchema.parse(listBody.coworkers[0]);

    const got = await app.request(`/api/coworkers/${coworker.id}`, {
      headers: { cookie: `${env.sessionCookieName}=${cookie}` },
    });
    expect(got.status).toBe(200);
    await expect(got.json()).resolves.toMatchObject({
      request_id: expect.stringMatching(/^req_/),
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
    const channel = channelSchema.parse(withoutRequestId(await channelRes.json()));

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
      request_id: expect.stringMatching(/^req_/),
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
    expect(coworkerProfileSchema.parse(withoutRequestId(await disabled.json())).status).toBe(
      "disabled",
    );

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
    const channel = channelSchema.parse(withoutRequestId(await channelRes.json()));
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
    const channel = channelSchema.parse(withoutRequestId(await channelRes.json()));
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

  it("rejects dropping archived channel membership via coworker PATCH", async () => {
    const { app, env, workspace } = await createTestApp();
    const { session, cookie } = await login(app, env);
    const channelRes = await app.request(`/api/workspaces/${env.workspaceId}/channels`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        name: "Keep",
        mission_brief: "Keep",
        idempotency_key: "idem_keep",
      }),
    });
    const channel = channelSchema.parse(withoutRequestId(await channelRes.json()));
    const coworker = await workspace.seedCoworker({
      workspaceId: env.workspaceId,
      createdBy: env.ownerUserId,
      handle: "member",
      name: "Member",
      title: "M",
    });
    const added = await app.request(`/api/channels/${channel.id}/participants`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        participant_type: "coworker",
        participant_id: coworker.id,
        role: "member",
        idempotency_key: "idem_keep_add",
      }),
    });
    expect(added.status).toBe(200);

    await app.request(`/api/channels/${channel.id}/archive`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({ schemaVersion: 1, idempotency_key: "idem_arch_keep" }),
    });

    const dropped = await app.request(`/api/coworkers/${coworker.id}`, {
      method: "PATCH",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        name: "Member",
        handle: "member",
        title: "M",
        standing_instructions: "",
        model_preset: "default",
        native_subagents_enabled: false,
        channel_ids: [],
        budget: { max_turn_tokens: 1000, max_tool_calls: 5 },
        task_record_grants: [],
        tool_grants: [],
        skill_version_ids: [],
        component_version_ids: [],
      }),
    });
    expect(dropped.status).toBe(409);
    expect(errorEnvelopeSchema.parse(await dropped.json()).error.details).toMatchObject({
      reason: "channel_archived",
    });
  });

  it("rejects cross-channel parent_message_id and preserves next_sequence on rename", async () => {
    const { app, env, workspaceStore } = await createTestApp();
    const { session, cookie } = await login(app, env);
    const aRes = await app.request(`/api/workspaces/${env.workspaceId}/channels`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        name: "A",
        mission_brief: "A",
        idempotency_key: "idem_a",
      }),
    });
    const bRes = await app.request(`/api/workspaces/${env.workspaceId}/channels`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        name: "B",
        mission_brief: "B",
        idempotency_key: "idem_b",
      }),
    });
    const channelA = channelSchema.parse(withoutRequestId(await aRes.json()));
    const channelB = channelSchema.parse(withoutRequestId(await bRes.json()));

    const posted = await app.request(`/api/channels/${channelA.id}/messages`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        body: "root",
        recipient_handles: [],
        routing_mode: "direct",
        parent_message_id: null,
      }),
    });
    expect(posted.status).toBe(201);
    const message = (await posted.json()) as { message_id: string; sequence: number };
    expect(message.sequence).toBe(0);

    const afterPost = await workspaceStore.getChannel(channelA.id);
    expect(afterPost?.nextSequence).toBe(1);

    const renamed = await app.request(`/api/channels/${channelA.id}`, {
      method: "PATCH",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        name: "A2",
        idempotency_key: "idem_rename_a",
      }),
    });
    expect(renamed.status).toBe(200);
    const renamedBody = channelSchema.parse(withoutRequestId(await renamed.json()));
    expect(renamedBody.next_sequence).toBe(1);
    expect((await workspaceStore.getChannel(channelA.id))?.nextSequence).toBe(1);

    const cross = await app.request(`/api/channels/${channelB.id}/messages`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        body: "reply",
        recipient_handles: [],
        routing_mode: "direct",
        parent_message_id: message.message_id,
      }),
    });
    expect(cross.status).toBe(400);
    expect(errorEnvelopeSchema.parse(await cross.json()).error.code).toBe("validation_failed");
  });

  it("disables coworker by revoking grants and removing channel participation", async () => {
    const { app, env, workspace, workspaceStore } = await createTestApp();
    const { session, cookie } = await login(app, env);
    const channelRes = await app.request(`/api/workspaces/${env.workspaceId}/channels`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        name: "Ops",
        mission_brief: "Ops",
        idempotency_key: "idem_ops2",
      }),
    });
    const channel = channelSchema.parse(withoutRequestId(await channelRes.json()));
    const coworker = await workspace.seedCoworker({
      workspaceId: env.workspaceId,
      createdBy: env.ownerUserId,
      handle: "retiree",
      name: "Retiree",
      title: "R",
    });
    await app.request(`/api/channels/${channel.id}/participants`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        participant_type: "coworker",
        participant_id: coworker.id,
        role: "member",
        idempotency_key: "idem_add_retiree",
      }),
    });
    await workspace.updateCoworker(session, coworker.id, {
      name: "Retiree",
      handle: "retiree",
      title: "R",
      standing_instructions: "",
      model_preset: "default",
      native_subagents_enabled: false,
      channel_ids: [channel.id],
      budget: { max_turn_tokens: 1000, max_tool_calls: 5 },
      task_record_grants: [{ channel_id: channel.id, operations: ["create"] }],
      tool_grants: [],
      skill_version_ids: [],
      component_version_ids: [],
    });

    const beforeDisable = await workspaceStore.getCoworker(coworker.id);
    const disabled = await app.request(`/api/coworkers/${coworker.id}/disable`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        expected_config_revision: beforeDisable?.configRevision,
        reason: "done",
        idempotency_key: "idem_disable_cleanup",
      }),
    });
    expect(disabled.status).toBe(200);

    const after = await workspaceStore.getCoworker(coworker.id);
    expect(after?.status).toBe("disabled");
    expect(after?.editableConfigJson.channel_ids).toEqual([]);
    expect(await workspaceStore.listActiveTaskGrantsForSubject(coworker.id)).toHaveLength(0);
    const participant = await workspaceStore.getParticipant(channel.id, "coworker", coworker.id);
    expect(participant?.removedAt).toBeTruthy();
  });

  it("replays disable and removeParticipant via idempotency before conflict/not-found", async () => {
    const { app, env, workspace, workspaceStore } = await createTestApp();
    const { session, cookie } = await login(app, env);
    const channelRes = await app.request(`/api/workspaces/${env.workspaceId}/channels`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        name: "Idem",
        mission_brief: "Idem",
        idempotency_key: "idem_idem_ch",
      }),
    });
    const channel = channelSchema.parse(withoutRequestId(await channelRes.json()));
    const coworker = await workspace.seedCoworker({
      workspaceId: env.workspaceId,
      createdBy: env.ownerUserId,
      handle: "idem",
      name: "Idem",
      title: "I",
    });
    await app.request(`/api/channels/${channel.id}/participants`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        participant_type: "coworker",
        participant_id: coworker.id,
        role: "member",
        idempotency_key: "idem_add_idem",
      }),
    });

    const removeBody = { schemaVersion: 1, idempotency_key: "idem_remove_replay" };
    const removed = await app.request(`/api/channels/${channel.id}/participants/${coworker.id}`, {
      method: "DELETE",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify(removeBody),
    });
    expect(removed.status).toBe(200);
    const removeRetry = await app.request(
      `/api/channels/${channel.id}/participants/${coworker.id}`,
      {
        method: "DELETE",
        headers: mutationHeaders(env, cookie, session.csrf_token),
        body: JSON.stringify(removeBody),
      },
    );
    expect(removeRetry.status).toBe(200);

    const afterMembership = await workspaceStore.getCoworker(coworker.id);
    const disableBody = {
      schemaVersion: 1,
      expected_config_revision: afterMembership?.configRevision,
      reason: "done",
      idempotency_key: "idem_disable_replay",
    };
    const disabled = await app.request(`/api/coworkers/${coworker.id}/disable`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify(disableBody),
    });
    expect(disabled.status).toBe(200);
    const disableRetry = await app.request(`/api/coworkers/${coworker.id}/disable`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify(disableBody),
    });
    expect(disableRetry.status).toBe(200);
    expect(coworkerProfileSchema.parse(withoutRequestId(await disableRetry.json())).status).toBe(
      "disabled",
    );
  });

  it("rejects malformed participant DELETE JSON bodies", async () => {
    const { app, env, workspace } = await createTestApp();
    const { session, cookie } = await login(app, env);
    const channelRes = await app.request(`/api/workspaces/${env.workspaceId}/channels`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        name: "Del",
        mission_brief: "Del",
        idempotency_key: "idem_del_ch",
      }),
    });
    const channel = channelSchema.parse(withoutRequestId(await channelRes.json()));
    const coworker = await workspace.seedCoworker({
      workspaceId: env.workspaceId,
      createdBy: env.ownerUserId,
      handle: "del",
      name: "Del",
      title: "D",
    });

    const malformed = await app.request(
      `/api/channels/${channel.id}/participants/${coworker.id}?idempotency_key=from_query`,
      {
        method: "DELETE",
        headers: mutationHeaders(env, cookie, session.csrf_token),
        body: "{not-json",
      },
    );
    expect(malformed.status).toBe(400);
    expect(errorEnvelopeSchema.parse(await malformed.json()).error.code).toBe("validation_failed");
  });

  it("reclaims stale in-progress idempotency claims after lease expiry", async () => {
    let clock = new Date("2026-08-26T12:00:00.000Z");
    const { app, env, workspaceStore } = await createTestApp({ now: () => clock });
    const { session, cookie } = await login(app, env);

    await workspaceStore.tryClaimCommandReceipt({
      workspaceId: env.workspaceId,
      commandKind: "channel.create",
      idempotencyKey: "idem_stale_claim",
      resultId: "channel_orphan",
      leaseOwner: "lease_orphan",
      resultJson: null,
      createdAt: clock.toISOString(),
    });

    clock = new Date(clock.getTime() + IDEMPOTENCY_CLAIM_LEASE_MS + 1);
    const created = await app.request(`/api/workspaces/${env.workspaceId}/channels`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        name: "Recovered",
        mission_brief: "after crash",
        idempotency_key: "idem_stale_claim",
      }),
    });
    expect(created.status).toBe(201);
    expect(channelSchema.parse(withoutRequestId(await created.json())).name).toBe("Recovered");
  });

  it("keeps heartbeating claims from being reclaimed while still running", async () => {
    let clock = new Date("2026-08-26T12:00:00.000Z");
    const { workspaceStore } = await createTestApp({ now: () => clock });
    await workspaceStore.tryClaimCommandReceipt({
      workspaceId: "workspace_1",
      commandKind: "channel.create",
      idempotencyKey: "idem_alive",
      resultId: "channel_alive",
      leaseOwner: "lease_alive",
      resultJson: null,
      createdAt: clock.toISOString(),
    });
    clock = new Date(clock.getTime() + IDEMPOTENCY_CLAIM_LEASE_MS - 1_000);
    await workspaceStore.touchCommandReceipt(
      "workspace_1",
      "channel.create",
      "idem_alive",
      "lease_alive",
      clock.toISOString(),
    );
    clock = new Date(clock.getTime() + IDEMPOTENCY_CLAIM_LEASE_MS);
    const cutoff = new Date(clock.getTime() - IDEMPOTENCY_CLAIM_LEASE_MS).toISOString();
    const reclaimed = await workspaceStore.reclaimStaleCommandReceipt(
      "workspace_1",
      "channel.create",
      "idem_alive",
      cutoff,
    );
    expect(reclaimed).toBe(false);
    const stillHeld = await workspaceStore.getCommandReceipt(
      "workspace_1",
      "channel.create",
      "idem_alive",
    );
    expect(stillHeld).toBeTruthy();
  });

  it("fences receipt touch and delete to the owning lease token", async () => {
    const { workspaceStore } = await createTestApp();
    await workspaceStore.tryClaimCommandReceipt({
      workspaceId: "workspace_1",
      commandKind: "channel.create",
      idempotencyKey: "idem_fence",
      resultId: "channel_fence",
      leaseOwner: "lease_owner_a",
      resultJson: null,
      createdAt: new Date("2026-08-26T12:00:00.000Z").toISOString(),
    });

    const foreignTouch = await workspaceStore.touchCommandReceipt(
      "workspace_1",
      "channel.create",
      "idem_fence",
      "lease_owner_b",
      new Date("2026-08-26T12:01:00.000Z").toISOString(),
    );
    expect(foreignTouch).toBe(false);

    await workspaceStore.deleteCommandReceipt(
      "workspace_1",
      "channel.create",
      "idem_fence",
      "lease_owner_b",
    );
    const stillPresent = await workspaceStore.getCommandReceipt(
      "workspace_1",
      "channel.create",
      "idem_fence",
    );
    expect(stillPresent?.leaseOwner).toBe("lease_owner_a");

    await workspaceStore.deleteCommandReceipt(
      "workspace_1",
      "channel.create",
      "idem_fence",
      "lease_owner_a",
    );
    await expect(
      workspaceStore.getCommandReceipt("workspace_1", "channel.create", "idem_fence"),
    ).resolves.toBeNull();
  });

  it("bumps config_revision on membership so stale coworker PATCH conflicts", async () => {
    const { app, env, workspace, workspaceStore } = await createTestApp();
    const { session, cookie } = await login(app, env);
    const channelRes = await app.request(`/api/workspaces/${env.workspaceId}/channels`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        name: "Rev",
        mission_brief: "Rev",
        idempotency_key: "idem_rev_ch",
      }),
    });
    const channel = channelSchema.parse(withoutRequestId(await channelRes.json()));
    const coworker = await workspace.seedCoworker({
      workspaceId: env.workspaceId,
      createdBy: env.ownerUserId,
      handle: "revvy",
      name: "Revvy",
      title: "R",
    });
    const snapshotRevision = coworker.configRevision;

    const added = await app.request(`/api/channels/${channel.id}/participants`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        participant_type: "coworker",
        participant_id: coworker.id,
        role: "member",
        idempotency_key: "idem_rev_add",
      }),
    });
    expect(added.status).toBe(200);
    const afterAdd = await workspaceStore.getCoworker(coworker.id);
    expect(afterAdd?.configRevision).toBe(snapshotRevision + 1);
    expect(afterAdd?.editableConfigJson.channel_ids).toEqual([channel.id]);

    const stalePatch = await workspaceStore.commitCoworkerUpdate({
      coworker: {
        ...coworker,
        name: "Stale",
        configRevision: snapshotRevision + 1,
        editableConfigJson: {
          ...coworker.editableConfigJson,
          channel_ids: [],
        },
        updatedAt: new Date().toISOString(),
      },
      version: {
        id: "av_stale_rev",
        agentProfileId: coworker.id,
        version: snapshotRevision + 1,
        configJson: { name: "Stale" },
        specHash: "sha256:stale",
        createdBy: env.ownerUserId,
        createdAt: new Date().toISOString(),
      },
      memberships: [],
      taskGrants: [],
      revokeGrantsAt: new Date().toISOString(),
      expectedConfigRevision: snapshotRevision,
      expectedStatus: "active",
    });
    expect(stalePatch.ok).toBe(false);
    if (!stalePatch.ok) {
      expect(stalePatch.reason).toBe("conflict");
    }
    const preserved = await workspaceStore.getCoworker(coworker.id);
    expect(preserved?.editableConfigJson.channel_ids).toEqual([channel.id]);
  });

  it("disable under lock clears memberships added after the pre-disable snapshot", async () => {
    const { env, workspace, workspaceStore } = await createTestApp();
    const channelId = "channel_snap";
    await workspaceStore.insertChannel({
      id: channelId,
      workspaceId: env.workspaceId,
      name: "Snap",
      missionBrief: "Snap",
      summary: null,
      policyJson: {},
      nextSequence: 0,
      status: "active",
      createdBy: env.ownerUserId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const coworker = await workspace.seedCoworker({
      workspaceId: env.workspaceId,
      createdBy: env.ownerUserId,
      handle: "snap",
      name: "Snap",
      title: "S",
    });

    // Membership that would be missed by a stale pre-lock snapshot.
    await workspaceStore.upsertParticipantMembership({
      participant: {
        channelId,
        participantType: "coworker",
        participantId: coworker.id,
        role: "member",
        joinedAt: new Date().toISOString(),
        removedAt: null,
      },
      coworkerId: coworker.id,
      coworkerUpdatedAt: new Date().toISOString(),
      channelOp: { type: "add", channelId },
    });
    const current = await workspaceStore.getCoworker(coworker.id);
    expect(current?.editableConfigJson.channel_ids).toEqual([channelId]);

    const disabled = await workspaceStore.disableCoworkerCleanup({
      coworker: {
        ...current!,
        status: "disabled",
        editableConfigJson: {
          ...current!.editableConfigJson,
          channel_ids: [],
          task_record_grants: [],
        },
        configRevision: current!.configRevision + 1,
        updatedAt: new Date().toISOString(),
      },
      revokeAt: new Date().toISOString(),
      // Intentionally omit the concurrent membership from any snapshot — cleanup
      // must discover and clear it under the profile lock.
      expectedConfigRevision: current!.configRevision,
    });
    expect(disabled.ok).toBe(true);

    const participant = await workspaceStore.getParticipant(channelId, "coworker", coworker.id);
    expect(participant?.removedAt).toBeTruthy();
    const after = await workspaceStore.getCoworker(coworker.id);
    expect(after?.status).toBe("disabled");
    expect(after?.editableConfigJson.channel_ids).toEqual([]);

    const lateAdd = await workspaceStore.upsertParticipantMembership({
      participant: {
        channelId,
        participantType: "coworker",
        participantId: coworker.id,
        role: "member",
        joinedAt: new Date().toISOString(),
        removedAt: null,
      },
      coworkerId: coworker.id,
      coworkerUpdatedAt: new Date().toISOString(),
      channelOp: { type: "add", channelId },
    });
    expect(lateAdd).toEqual({ ok: false, reason: "coworker_inactive" });
  });

  it("rejects removeParticipant idempotency key reuse for a different target", async () => {
    const { app, env, workspace } = await createTestApp();
    const { session, cookie } = await login(app, env);
    const channelRes = await app.request(`/api/workspaces/${env.workspaceId}/channels`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        name: "Reuse",
        mission_brief: "Reuse",
        idempotency_key: "idem_reuse_ch",
      }),
    });
    const channel = channelSchema.parse(withoutRequestId(await channelRes.json()));
    const alpha = await workspace.seedCoworker({
      workspaceId: env.workspaceId,
      createdBy: env.ownerUserId,
      handle: "reuse_a",
      name: "A",
      title: "A",
    });
    const beta = await workspace.seedCoworker({
      workspaceId: env.workspaceId,
      createdBy: env.ownerUserId,
      handle: "reuse_b",
      name: "B",
      title: "B",
    });
    for (const coworker of [alpha, beta]) {
      const added = await app.request(`/api/channels/${channel.id}/participants`, {
        method: "POST",
        headers: mutationHeaders(env, cookie, session.csrf_token),
        body: JSON.stringify({
          schemaVersion: 1,
          participant_type: "coworker",
          participant_id: coworker.id,
          role: "member",
          idempotency_key: `idem_add_${coworker.handle}`,
        }),
      });
      expect(added.status).toBe(200);
    }

    const removeKey = "idem_remove_shared";
    const removed = await app.request(`/api/channels/${channel.id}/participants/${alpha.id}`, {
      method: "DELETE",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({ schemaVersion: 1, idempotency_key: removeKey }),
    });
    expect(removed.status).toBe(200);

    const reused = await app.request(`/api/channels/${channel.id}/participants/${beta.id}`, {
      method: "DELETE",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({ schemaVersion: 1, idempotency_key: removeKey }),
    });
    expect(reused.status).toBe(409);
    expect(errorEnvelopeSchema.parse(await reused.json()).error.details).toMatchObject({
      reason: "idempotency_key_reuse",
    });
    const stillMember = await app.request(`/api/coworkers/${beta.id}`, {
      headers: { cookie: `${env.sessionCookieName}=${cookie}` },
    });
    expect(stillMember.status).toBe(200);
    await expect(stillMember.json()).resolves.toMatchObject({
      config: { channel_ids: [channel.id] },
    });
  });

  it("merges channel_ids under lock and rejects archived membership writes", async () => {
    const { app, env, workspace, workspaceStore } = await createTestApp();
    const { session, cookie } = await login(app, env);
    const aRes = await app.request(`/api/workspaces/${env.workspaceId}/channels`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        name: "CA",
        mission_brief: "A",
        idempotency_key: "idem_ca",
      }),
    });
    const bRes = await app.request(`/api/workspaces/${env.workspaceId}/channels`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        name: "CB",
        mission_brief: "B",
        idempotency_key: "idem_cb",
      }),
    });
    const channelA = channelSchema.parse(withoutRequestId(await aRes.json()));
    const channelB = channelSchema.parse(withoutRequestId(await bRes.json()));
    const coworker = await workspace.seedCoworker({
      workspaceId: env.workspaceId,
      createdBy: env.ownerUserId,
      handle: "merge",
      name: "Merge",
      title: "M",
    });

    const addA = await app.request(`/api/channels/${channelA.id}/participants`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        participant_type: "coworker",
        participant_id: coworker.id,
        role: "member",
        idempotency_key: "idem_merge_a",
      }),
    });
    expect(addA.status).toBe(200);

    // Simulate a concurrent writer that already recorded channel A on the coworker.
    const locked = await workspaceStore.getCoworker(coworker.id);
    expect(locked?.editableConfigJson.channel_ids).toEqual([channelA.id]);

    const addB = await workspaceStore.upsertParticipantMembership({
      participant: {
        channelId: channelB.id,
        participantType: "coworker",
        participantId: coworker.id,
        role: "member",
        joinedAt: new Date().toISOString(),
        removedAt: null,
      },
      coworkerId: coworker.id,
      coworkerUpdatedAt: new Date().toISOString(),
      channelOp: { type: "add", channelId: channelB.id },
    });
    expect(addB.ok).toBe(true);
    if (addB.ok) {
      expect(addB.coworker.editableConfigJson.channel_ids.sort()).toEqual(
        [channelA.id, channelB.id].sort(),
      );
    }

    await app.request(`/api/channels/${channelB.id}/archive`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({ schemaVersion: 1, idempotency_key: "idem_arch_b" }),
    });
    const archivedWrite = await workspaceStore.upsertParticipantMembership({
      participant: {
        channelId: channelB.id,
        participantType: "coworker",
        participantId: coworker.id,
        role: "member",
        joinedAt: new Date().toISOString(),
        removedAt: null,
      },
      coworkerId: coworker.id,
      coworkerUpdatedAt: new Date().toISOString(),
      channelOp: { type: "add", channelId: channelB.id },
    });
    expect(archivedWrite).toEqual({ ok: false, reason: "channel_archived" });
  });

  it("prevents stale coworker edits from resurrecting a disabled coworker", async () => {
    const { app, env, workspace, workspaceStore } = await createTestApp();
    const { session, cookie } = await login(app, env);
    const channelRes = await app.request(`/api/workspaces/${env.workspaceId}/channels`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        name: "Race",
        mission_brief: "Race",
        idempotency_key: "idem_race_ch",
      }),
    });
    const channel = channelSchema.parse(withoutRequestId(await channelRes.json()));
    const coworker = await workspace.seedCoworker({
      workspaceId: env.workspaceId,
      createdBy: env.ownerUserId,
      handle: "race",
      name: "Race",
      title: "R",
    });

    const disabled = await app.request(`/api/coworkers/${coworker.id}/disable`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        expected_config_revision: 1,
        reason: "done",
        idempotency_key: "idem_race_disable",
      }),
    });
    expect(disabled.status).toBe(200);

    const resurrect = await workspaceStore.commitCoworkerUpdate({
      coworker: {
        ...coworker,
        status: "active",
        name: "Resurrected",
        configRevision: 2,
        editableConfigJson: {
          ...coworker.editableConfigJson,
          channel_ids: [channel.id],
        },
        updatedAt: new Date().toISOString(),
      },
      version: {
        id: "av_stale",
        agentProfileId: coworker.id,
        version: 2,
        configJson: { name: "Resurrected" },
        specHash: "sha256:stale",
        createdBy: env.ownerUserId,
        createdAt: new Date().toISOString(),
      },
      memberships: [
        {
          channelId: channel.id,
          participantType: "coworker",
          participantId: coworker.id,
          role: "member",
          joinedAt: new Date().toISOString(),
          removedAt: null,
        },
      ],
      taskGrants: [],
      revokeGrantsAt: new Date().toISOString(),
      expectedConfigRevision: 1,
      expectedStatus: "active",
    });
    expect(resurrect.ok).toBe(false);
    if (!resurrect.ok) {
      expect(resurrect.reason).toBe("conflict");
      expect(resurrect.actualStatus).toBe("disabled");
    }
    const after = await workspaceStore.getCoworker(coworker.id);
    expect(after?.status).toBe("disabled");
    expect(after?.editableConfigJson.channel_ids).toEqual([]);
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
      const channel = channelSchema.parse(withoutRequestId(await created.json()));

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
