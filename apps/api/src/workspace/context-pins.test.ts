import { describe, expect, it } from "vitest";
import {
  channelContextEnvelopeSchema,
  channelPinSchema,
  channelSchema,
  sessionResponseSchema,
} from "@forgeroom/contracts";
import { loadApiEnv } from "../env";
import { createApiApp } from "../server";
import { createAuthService } from "../auth/service";
import { createMemoryAuthStore } from "../auth/store";
import { createMemoryWorkspaceStore, type WorkspaceCatalogStore } from "./store";
import { createWorkspaceService } from "./service";
import { envelopeDeliveredThroughSequence } from "@forgeroom/orchestration";

const PASSWORD = "correct-horse-battery";
const HASH = `sha256:${"cd".repeat(32)}`;

function withoutRequestId(body: unknown): Record<string, unknown> {
  const record = (body ?? {}) as Record<string, unknown>;
  const { request_id: _requestId, ...rest } = record;
  return rest;
}

async function createTestApp(options?: { workspaceStore?: WorkspaceCatalogStore }) {
  const authStore = createMemoryAuthStore();
  const workspaceStore = options?.workspaceStore ?? createMemoryWorkspaceStore();
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

async function createChannel(
  app: ReturnType<typeof createApiApp>,
  env: ReturnType<typeof loadApiEnv>,
  cookie: string,
  csrf: string,
  name: string,
  key: string,
) {
  const created = await app.request(`/api/workspaces/${env.workspaceId}/channels`, {
    method: "POST",
    headers: mutationHeaders(env, cookie, csrf),
    body: JSON.stringify({
      schemaVersion: 1,
      name,
      mission_brief: `Mission for ${name}`,
      idempotency_key: key,
    }),
  });
  expect(created.status).toBe(201);
  return channelSchema.parse(withoutRequestId(await created.json()));
}

describe("P0-108 channel context and pins", () => {
  it("pins and unpins a message while retaining the source link and emitting events", async () => {
    const { app, env, workspaceStore } = await createTestApp();
    const { session, cookie } = await login(app, env);
    const channel = await createChannel(
      app,
      env,
      cookie,
      session.csrf_token,
      "Pins",
      "idem_pin_ch",
    );

    const message = await app.request(`/api/channels/${channel.id}/messages`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        body: "Pin this brief",
        recipient_handles: [],
        routing_mode: "direct",
        parent_message_id: null,
      }),
    });
    expect(message.status).toBe(201);
    const messageBody = (await message.json()) as { message_id: string; sequence: number };

    const pinned = await app.request(`/api/channels/${channel.id}/pins`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        source_message_id: messageBody.message_id,
        source_artifact_id: null,
        label: "Brief",
        idempotency_key: "idem_pin_msg",
      }),
    });
    expect(pinned.status).toBe(201);
    const pinPayload = withoutRequestId(await pinned.json()) as {
      pin: unknown;
      sequence: number;
    };
    const pin = channelPinSchema.parse(pinPayload.pin);
    expect(pin.source_message_id).toBe(messageBody.message_id);
    expect(pin.source_artifact_id).toBeNull();
    expect(pin.label).toBe("Brief");
    expect(pinPayload.sequence).toBeGreaterThan(messageBody.sequence);

    const events = await app.request(`/api/channels/${channel.id}/events?afterSequence=-1`, {
      headers: { cookie: `${env.sessionCookieName}=${cookie}` },
    });
    expect(events.status).toBe(200);
    const listed = (await events.json()) as {
      events: Array<{ aguiEvent: { type: string; name?: string }; sourceMessageId?: string }>;
    };
    const pinCreated = listed.events.find(
      (event) => event.aguiEvent.type === "CUSTOM" && event.aguiEvent.name === "pin.created",
    );
    expect(pinCreated?.sourceMessageId).toBe(messageBody.message_id);

    const removed = await app.request(`/api/channels/${channel.id}/pins/${pin.id}`, {
      method: "DELETE",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        idempotency_key: "idem_unpin_msg",
      }),
    });
    expect(removed.status).toBe(200);
    const removedPin = channelPinSchema.parse(
      (withoutRequestId(await removed.json()) as { pin: unknown }).pin,
    );
    expect(removedPin.source_message_id).toBe(messageBody.message_id);
    expect(removedPin.id).toBe(pin.id);

    const afterRemove = await workspaceStore.listActivePins(channel.id);
    expect(afterRemove).toHaveLength(0);

    const eventsAfter = await app.request(`/api/channels/${channel.id}/events?afterSequence=-1`, {
      headers: { cookie: `${env.sessionCookieName}=${cookie}` },
    });
    const listedAfter = (await eventsAfter.json()) as {
      events: Array<{ aguiEvent: { type: string; name?: string } }>;
    };
    expect(
      listedAfter.events.some(
        (event) => event.aguiEvent.type === "CUSTOM" && event.aguiEvent.name === "pin.removed",
      ),
    ).toBe(true);
  });

  it("rejects cross-channel pin sources and keeps context channel-local", async () => {
    const { app, env, workspace, workspaceStore } = await createTestApp();
    const { session, cookie } = await login(app, env);
    const channelA = await createChannel(app, env, cookie, session.csrf_token, "A", "idem_a");
    const channelB = await createChannel(app, env, cookie, session.csrf_token, "B", "idem_b");

    const messageB = await app.request(`/api/channels/${channelB.id}/messages`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        body: "Foreign message",
        recipient_handles: [],
        routing_mode: "direct",
        parent_message_id: null,
      }),
    });
    const foreign = (await messageB.json()) as { message_id: string };

    const rejected = await app.request(`/api/channels/${channelA.id}/pins`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        source_message_id: foreign.message_id,
        source_artifact_id: null,
        label: "Leak",
        idempotency_key: "idem_cross",
      }),
    });
    expect(rejected.status).toBe(400);

    await workspaceStore.insertArtifact({
      id: "artifact_b",
      workspaceId: env.workspaceId,
      channelId: channelB.id,
      runId: "run_b",
      runStepId: "step_b",
      creatorAgentId: "cw_b",
      kind: "file",
      name: "secret.md",
      mimeType: "text/markdown",
      byteSize: 12,
      sha256: HASH,
      revision: 1,
      createdAt: new Date().toISOString(),
    });
    await workspaceStore.insertArtifact({
      id: "artifact_a",
      workspaceId: env.workspaceId,
      channelId: channelA.id,
      runId: "run_a",
      runStepId: "step_a",
      creatorAgentId: "cw_a",
      kind: "file",
      name: "local.md",
      mimeType: "text/markdown",
      byteSize: 8,
      sha256: HASH,
      revision: 1,
      createdAt: new Date().toISOString(),
    });

    const coworker = await workspace.seedCoworker({
      workspaceId: env.workspaceId,
      createdBy: env.ownerUserId,
      handle: "operator",
      name: "Operator",
      title: "Operator",
    });
    await app.request(`/api/channels/${channelA.id}/participants`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        participant_type: "coworker",
        participant_id: coworker.id,
        role: "member",
        idempotency_key: "idem_member_a",
      }),
    });

    const nowIso = new Date().toISOString();
    await workspaceStore.upsertChannelAgentSession({
      id: "cas_a",
      workspaceId: env.workspaceId,
      channelId: channelA.id,
      agentProfileId: coworker.id,
      logicalAguiThreadId: "thread_a",
      currentGenerationId: null,
      lastDeliveredChannelSequence: 0,
      state: "active",
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    const context = await workspace.buildChannelContextForTurn({
      session,
      channelId: channelA.id,
      coworkerId: coworker.id,
      channelAgentSessionId: "cas_a",
      humanRequest: "Summarize local work",
      assignment: {
        run_id: "run_a",
        run_step_id: "step_a",
        goal: "Stay in channel A",
        objective: "No foreign state",
      },
    });
    expect(context.ok).toBe(true);
    if (!context.ok) {
      return;
    }
    const envelope = channelContextEnvelopeSchema.parse(context.value);
    expect(envelope.channel.id).toBe(channelA.id);
    expect(envelope.artifacts.map((row) => row.id)).toEqual(["artifact_a"]);
    expect(JSON.stringify(envelope)).not.toContain(channelB.id);
    expect(JSON.stringify(envelope)).not.toContain("artifact_b");
    expect(JSON.stringify(envelope)).not.toContain(foreign.message_id);
  });

  it("builds a full envelope and advances the delivery cursor only after confirmation", async () => {
    const { app, env, workspace, workspaceStore } = await createTestApp();
    const { session, cookie } = await login(app, env);
    const channel = await createChannel(
      app,
      env,
      cookie,
      session.csrf_token,
      "Context",
      "idem_ctx",
    );

    const coworker = await workspace.seedCoworker({
      workspaceId: env.workspaceId,
      createdBy: env.ownerUserId,
      handle: "researcher",
      name: "Researcher",
      title: "Research",
    });
    await app.request(`/api/channels/${channel.id}/participants`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        participant_type: "coworker",
        participant_id: coworker.id,
        role: "member",
        idempotency_key: "idem_member_ctx",
      }),
    });

    const message = await app.request(`/api/channels/${channel.id}/messages`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        body: "Please research the launch checklist",
        recipient_handles: ["researcher"],
        routing_mode: "direct",
        parent_message_id: null,
      }),
    });
    const messageBody = (await message.json()) as { message_id: string; sequence: number };

    await app.request(`/api/channels/${channel.id}/pins`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        source_message_id: messageBody.message_id,
        source_artifact_id: null,
        label: "Checklist ask",
        idempotency_key: "idem_pin_ctx",
      }),
    });

    await workspaceStore.insertArtifact({
      id: "artifact_ctx",
      workspaceId: env.workspaceId,
      channelId: channel.id,
      runId: "run_ctx",
      runStepId: "step_ctx",
      creatorAgentId: coworker.id,
      kind: "preview",
      name: "checklist.html",
      mimeType: "text/html",
      byteSize: 42,
      sha256: HASH,
      revision: 1,
      createdAt: new Date().toISOString(),
    });

    const nowIso = new Date().toISOString();
    await workspaceStore.upsertChannelAgentSession({
      id: "cas_ctx",
      workspaceId: env.workspaceId,
      channelId: channel.id,
      agentProfileId: coworker.id,
      logicalAguiThreadId: "thread_ctx",
      currentGenerationId: null,
      lastDeliveredChannelSequence: 0,
      state: "active",
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    const built = await workspace.buildChannelContextForTurn({
      session,
      channelId: channel.id,
      coworkerId: coworker.id,
      channelAgentSessionId: "cas_ctx",
      humanRequest: "Please research the launch checklist",
      assignment: {
        run_id: "run_ctx",
        run_step_id: "step_ctx",
        goal: "Research launch",
        objective: "Produce checklist notes",
      },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    const envelope = channelContextEnvelopeSchema.parse(built.value);
    expect(envelope.version).toBe("CHANNEL_CONTEXT_V1");
    expect(envelope.channel.mission_brief).toContain("Context");
    expect(envelope.roster.some((row) => row.participant_id === coworker.id)).toBe(true);
    expect(envelope.assignment?.coworker_id).toBe(coworker.id);
    expect(envelope.pins[0]?.source_message_id).toBe(messageBody.message_id);
    expect(envelope.artifacts[0]?.id).toBe("artifact_ctx");
    expect(envelope.summary !== undefined).toBe(true);
    expect(envelope.recent_deltas.length).toBeGreaterThan(0);
    expect(JSON.stringify(envelope)).not.toContain('"password"');
    expect(JSON.stringify(envelope)).not.toContain('"api_key"');
    expect(JSON.stringify(envelope)).not.toContain('"reasoning"');
    expect(JSON.stringify(envelope)).not.toContain("sk-live");

    const envelopeMax = envelopeDeliveredThroughSequence(envelope);

    const pending = await workspace.advanceSessionDeliveryCursor({
      session,
      channelAgentSessionId: "cas_ctx",
      deliveredThroughSequence: messageBody.sequence,
      envelopeRecentDeltas: envelope.recent_deltas,
      turnCreation: "pending",
    });
    expect(pending.ok && pending.value.advanced).toBe(false);
    expect(pending.ok && pending.value.last_delivered_channel_sequence).toBe(0);

    const confirmed = await workspace.advanceSessionDeliveryCursor({
      session,
      channelAgentSessionId: "cas_ctx",
      deliveredThroughSequence: envelopeMax,
      envelopeRecentDeltas: envelope.recent_deltas,
      turnCreation: "confirmed",
    });
    expect(confirmed.ok && confirmed.value.advanced).toBe(true);
    expect(confirmed.ok && confirmed.value.last_delivered_channel_sequence).toBe(envelopeMax);

    const sessionRow = await workspaceStore.getChannelAgentSession("cas_ctx");
    expect(sessionRow?.lastDeliveredChannelSequence).toBe(envelopeMax);
  });

  it("pins an artifact with retained source link", async () => {
    const { app, env, workspaceStore } = await createTestApp();
    const { session, cookie } = await login(app, env);
    const channel = await createChannel(
      app,
      env,
      cookie,
      session.csrf_token,
      "Artifacts",
      "idem_art",
    );
    await workspaceStore.insertArtifact({
      id: "artifact_pin",
      workspaceId: env.workspaceId,
      channelId: channel.id,
      runId: "run_pin",
      runStepId: "step_pin",
      creatorAgentId: "cw_pin",
      kind: "file",
      name: "notes.md",
      mimeType: "text/markdown",
      byteSize: 10,
      sha256: HASH,
      revision: 1,
      createdAt: new Date().toISOString(),
    });

    const pinned = await app.request(`/api/channels/${channel.id}/pins`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        source_message_id: null,
        source_artifact_id: "artifact_pin",
        label: "Notes",
        idempotency_key: "idem_pin_art",
      }),
    });
    expect(pinned.status).toBe(201);
    const pin = channelPinSchema.parse(
      (withoutRequestId(await pinned.json()) as { pin: unknown }).pin,
    );
    expect(pin.source_artifact_id).toBe("artifact_pin");
    expect(pin.source_message_id).toBeNull();
  });

  it("replays pin create/remove with the real event sequence and rejects cross-pin key reuse", async () => {
    const { app, env, workspace, workspaceStore } = await createTestApp();
    const { session, cookie } = await login(app, env);
    const channel = await createChannel(
      app,
      env,
      cookie,
      session.csrf_token,
      "IdemPins",
      "idem_pin_seq_ch",
    );

    const msgA = await app.request(`/api/channels/${channel.id}/messages`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        body: "A",
        recipient_handles: [],
        routing_mode: "direct",
        parent_message_id: null,
      }),
    });
    const msgB = await app.request(`/api/channels/${channel.id}/messages`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        body: "B",
        recipient_handles: [],
        routing_mode: "direct",
        parent_message_id: null,
      }),
    });
    const a = (await msgA.json()) as { message_id: string };
    const b = (await msgB.json()) as { message_id: string };

    const createBody = {
      schemaVersion: 1,
      source_message_id: a.message_id,
      source_artifact_id: null,
      label: "A",
      idempotency_key: "idem_pin_seq_create",
    };
    const created = await app.request(`/api/channels/${channel.id}/pins`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify(createBody),
    });
    expect(created.status).toBe(201);
    const createdPayload = withoutRequestId(await created.json()) as {
      pin: { id: string };
      sequence: number;
    };
    expect(createdPayload.sequence).toBeGreaterThanOrEqual(0);

    const createReplay = await app.request(`/api/channels/${channel.id}/pins`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify(createBody),
    });
    expect(createReplay.status).toBe(201);
    const createReplayPayload = withoutRequestId(await createReplay.json()) as {
      pin: { id: string };
      sequence: number;
    };
    expect(createReplayPayload.pin.id).toBe(createdPayload.pin.id);
    expect(createReplayPayload.sequence).toBe(createdPayload.sequence);

    const other = await app.request(`/api/channels/${channel.id}/pins`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        source_message_id: b.message_id,
        source_artifact_id: null,
        label: "B",
        idempotency_key: "idem_pin_seq_other",
      }),
    });
    const otherPin = withoutRequestId(await other.json()) as {
      pin: { id: string };
      sequence: number;
    };

    const removeBody = {
      schemaVersion: 1,
      idempotency_key: "idem_pin_seq_remove",
    };
    const removed = await app.request(`/api/channels/${channel.id}/pins/${createdPayload.pin.id}`, {
      method: "DELETE",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify(removeBody),
    });
    expect(removed.status).toBe(200);
    const removedPayload = withoutRequestId(await removed.json()) as {
      pin: { id: string };
      sequence: number;
    };
    expect(removedPayload.sequence).toBeGreaterThan(createdPayload.sequence);

    const removeReplay = await app.request(
      `/api/channels/${channel.id}/pins/${createdPayload.pin.id}`,
      {
        method: "DELETE",
        headers: mutationHeaders(env, cookie, session.csrf_token),
        body: JSON.stringify(removeBody),
      },
    );
    expect(removeReplay.status).toBe(200);
    const removeReplayPayload = withoutRequestId(await removeReplay.json()) as {
      pin: { id: string };
      sequence: number;
    };
    expect(removeReplayPayload.pin.id).toBe(createdPayload.pin.id);
    expect(removeReplayPayload.sequence).toBe(removedPayload.sequence);

    const wrongPin = await app.request(`/api/channels/${channel.id}/pins/${otherPin.pin.id}`, {
      method: "DELETE",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify(removeBody),
    });
    expect(wrongPin.status).toBe(409);

    const coworker = await workspace.seedCoworker({
      workspaceId: env.workspaceId,
      createdBy: env.ownerUserId,
      handle: "cursor",
      name: "Cursor",
      title: "Cursor",
    });
    await app.request(`/api/channels/${channel.id}/participants`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        participant_type: "coworker",
        participant_id: coworker.id,
        role: "member",
        idempotency_key: "idem_cursor_member",
      }),
    });
    const nowIso = new Date().toISOString();
    await workspaceStore.upsertChannelAgentSession({
      id: "cas_mono",
      workspaceId: env.workspaceId,
      channelId: channel.id,
      agentProfileId: coworker.id,
      logicalAguiThreadId: "thread_mono",
      currentGenerationId: null,
      lastDeliveredChannelSequence: 0,
      state: "active",
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    const channelRow = await workspaceStore.getChannel(channel.id);
    const highWater = Math.max(0, (channelRow?.nextSequence ?? 1) - 1);
    const [low, high] = await Promise.all([
      workspace.advanceSessionDeliveryCursor({
        session,
        channelAgentSessionId: "cas_mono",
        deliveredThroughSequence: Math.min(2, highWater),
        envelopeRecentDeltas: Array.from({ length: highWater }, (_, index) => ({ sequence: index + 1 })),
        turnCreation: "confirmed",
      }),
      workspace.advanceSessionDeliveryCursor({
        session,
        channelAgentSessionId: "cas_mono",
        deliveredThroughSequence: highWater,
        envelopeRecentDeltas: Array.from({ length: highWater }, (_, index) => ({ sequence: index + 1 })),
        turnCreation: "confirmed",
      }),
    ]);
    expect(low.ok && high.ok).toBe(true);
    const finalSession = await workspaceStore.getChannelAgentSession("cas_mono");
    expect(finalSession?.lastDeliveredChannelSequence).toBe(highWater);
    expect(finalSession?.lastDeliveredChannelSequence).toBeGreaterThanOrEqual(
      Math.min(2, highWater),
    );
  });

  it("rejects context for inactive agent sessions", async () => {
    const { app, env, workspace, workspaceStore } = await createTestApp();
    const { session, cookie } = await login(app, env);
    const channel = await createChannel(
      app,
      env,
      cookie,
      session.csrf_token,
      "Auth",
      "idem_auth_ch",
    );
    const coworker = await workspace.seedCoworker({
      workspaceId: env.workspaceId,
      createdBy: env.ownerUserId,
      handle: "inactive",
      name: "Inactive",
      title: "Inactive",
    });
    const nowIso = new Date().toISOString();
    await workspaceStore.upsertChannelAgentSession({
      id: "cas_inactive",
      workspaceId: env.workspaceId,
      channelId: channel.id,
      agentProfileId: coworker.id,
      logicalAguiThreadId: "thread_inactive",
      currentGenerationId: null,
      lastDeliveredChannelSequence: 0,
      state: "disabled",
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    const disabledSession = await workspace.buildChannelContextForTurn({
      session,
      channelId: channel.id,
      coworkerId: coworker.id,
      channelAgentSessionId: "cas_inactive",
      humanRequest: "Should fail",
      assignment: null,
    });
    expect(disabledSession.ok).toBe(false);
    if (!disabledSession.ok) {
      expect(disabledSession.error.code).toBe("forbidden");
    }
  });

  it("rejects cross-channel pin create idempotency key reuse", async () => {
    const { app, env } = await createTestApp();
    const { session, cookie } = await login(app, env);
    const channelA = await createChannel(app, env, cookie, session.csrf_token, "X", "idem_x_a");
    const channelB = await createChannel(app, env, cookie, session.csrf_token, "Y", "idem_x_b");

    const msgA = await app.request(`/api/channels/${channelA.id}/messages`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        body: "A",
        recipient_handles: [],
        routing_mode: "direct",
        parent_message_id: null,
      }),
    });
    const msgB = await app.request(`/api/channels/${channelB.id}/messages`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        body: "B",
        recipient_handles: [],
        routing_mode: "direct",
        parent_message_id: null,
      }),
    });
    const a = (await msgA.json()) as { message_id: string };
    const b = (await msgB.json()) as { message_id: string };

    const key = "idem_cross_channel_pin";
    const created = await app.request(`/api/channels/${channelA.id}/pins`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        source_message_id: a.message_id,
        source_artifact_id: null,
        label: "A",
        idempotency_key: key,
      }),
    });
    expect(created.status).toBe(201);

    const conflict = await app.request(`/api/channels/${channelB.id}/pins`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        source_message_id: b.message_id,
        source_artifact_id: null,
        label: "B",
        idempotency_key: key,
      }),
    });
    expect(conflict.status).toBe(409);
  });

  it("replays pin create after channel archival via idempotency receipt", async () => {
    const { app, env } = await createTestApp();
    const { session, cookie } = await login(app, env);
    const channel = await createChannel(
      app,
      env,
      cookie,
      session.csrf_token,
      "ArchivePin",
      "idem_arch_pin_ch",
    );
    const message = await app.request(`/api/channels/${channel.id}/messages`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        body: "Pin before archive",
        recipient_handles: [],
        routing_mode: "direct",
        parent_message_id: null,
      }),
    });
    const messageBody = (await message.json()) as { message_id: string };
    const body = {
      schemaVersion: 1,
      source_message_id: messageBody.message_id,
      source_artifact_id: null,
      label: "Keep",
      idempotency_key: "idem_arch_pin",
    };
    const pinned = await app.request(`/api/channels/${channel.id}/pins`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify(body),
    });
    expect(pinned.status).toBe(201);
    const first = withoutRequestId(await pinned.json()) as {
      pin: { id: string };
      sequence: number;
    };

    const archived = await app.request(`/api/channels/${channel.id}/archive`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({ schemaVersion: 1, idempotency_key: "idem_arch_pin_ch_done" }),
    });
    expect(archived.status).toBe(200);

    const replay = await app.request(`/api/channels/${channel.id}/pins`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify(body),
    });
    expect(replay.status).toBe(201);
    const second = withoutRequestId(await replay.json()) as {
      pin: { id: string };
      sequence: number;
    };
    expect(second.pin.id).toBe(first.pin.id);
    expect(second.sequence).toBe(first.sequence);
  });

  it("excludes cross-workspace artifacts from context and rejects pinning them", async () => {
    const { app, env, workspace, workspaceStore } = await createTestApp();
    const { session, cookie } = await login(app, env);
    const channel = await createChannel(
      app,
      env,
      cookie,
      session.csrf_token,
      "WorkspaceArt",
      "idem_ws_art",
    );
    await workspaceStore.insertArtifact({
      id: "artifact_foreign_ws",
      workspaceId: "workspace_other",
      channelId: channel.id,
      runId: "run_foreign",
      runStepId: "step_foreign",
      creatorAgentId: "cw_foreign",
      kind: "file",
      name: "foreign.md",
      mimeType: "text/markdown",
      byteSize: 4,
      sha256: HASH,
      revision: 1,
      createdAt: new Date().toISOString(),
    });

    const rejected = await app.request(`/api/channels/${channel.id}/pins`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        source_message_id: null,
        source_artifact_id: "artifact_foreign_ws",
        label: "Foreign",
        idempotency_key: "idem_ws_art_pin",
      }),
    });
    expect(rejected.status).toBe(400);

    const coworker = await workspace.seedCoworker({
      workspaceId: env.workspaceId,
      createdBy: env.ownerUserId,
      handle: "ws_guard",
      name: "Ws Guard",
      title: "Guard",
    });
    await app.request(`/api/channels/${channel.id}/participants`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        participant_type: "coworker",
        participant_id: coworker.id,
        role: "member",
        idempotency_key: "idem_ws_guard",
      }),
    });
    const nowIso = new Date().toISOString();
    await workspaceStore.upsertChannelAgentSession({
      id: "cas_ws",
      workspaceId: env.workspaceId,
      channelId: channel.id,
      agentProfileId: coworker.id,
      logicalAguiThreadId: "thread_ws",
      currentGenerationId: null,
      lastDeliveredChannelSequence: 0,
      state: "active",
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    const context = await workspace.buildChannelContextForTurn({
      session,
      channelId: channel.id,
      coworkerId: coworker.id,
      channelAgentSessionId: "cas_ws",
      humanRequest: "Check artifacts",
      assignment: null,
    });
    expect(context.ok).toBe(true);
    if (context.ok) {
      expect(context.value.artifacts.some((row) => row.id === "artifact_foreign_ws")).toBe(false);
    }
  });

  it("replays create-pin after unpin without recreating", async () => {
    const { app, env } = await createTestApp();
    const { session, cookie } = await login(app, env);
    const channel = await createChannel(app, env, cookie, session.csrf_token, "UnpinReplay", "idem_unpin_replay_ch");
    const message = await app.request(`/api/channels/${channel.id}/messages`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({ body: "Replay me", recipient_handles: [], routing_mode: "direct", parent_message_id: null }),
    });
    const messageBody = (await message.json()) as { message_id: string };
    const body = { schemaVersion: 1, source_message_id: messageBody.message_id, source_artifact_id: null, label: "Replay", idempotency_key: "idem_unpin_replay" };
    const created = await app.request(`/api/channels/${channel.id}/pins`, { method: "POST", headers: mutationHeaders(env, cookie, session.csrf_token), body: JSON.stringify(body) });
    const first = withoutRequestId(await created.json()) as { pin: { id: string }; sequence: number };
    await app.request(`/api/channels/${channel.id}/pins/${first.pin.id}`, { method: "DELETE", headers: mutationHeaders(env, cookie, session.csrf_token), body: JSON.stringify({ schemaVersion: 1, idempotency_key: "idem_unpin_replay_remove" }) });
    const replay = await app.request(`/api/channels/${channel.id}/pins`, { method: "POST", headers: mutationHeaders(env, cookie, session.csrf_token), body: JSON.stringify(body) });
    expect(replay.status).toBe(201);
    const second = withoutRequestId(await replay.json()) as { pin: { id: string }; sequence: number };
    expect(second.pin.id).toBe(first.pin.id);
    expect(second.sequence).toBe(first.sequence);
  });

  it("rejects delivery cursor advance beyond envelope-delivered sequence", async () => {
    const { app, env, workspace, workspaceStore } = await createTestApp();
    const { session, cookie } = await login(app, env);
    const channel = await createChannel(
      app,
      env,
      cookie,
      session.csrf_token,
      "CursorCap",
      "idem_cursor_cap",
    );
    const coworker = await workspace.seedCoworker({
      workspaceId: env.workspaceId,
      createdBy: env.ownerUserId,
      handle: "capper",
      name: "Capper",
      title: "Cap",
    });
    await app.request(`/api/channels/${channel.id}/participants`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        participant_type: "coworker",
        participant_id: coworker.id,
        role: "member",
        idempotency_key: "idem_cap_member",
      }),
    });
    const nowIso = new Date().toISOString();
    await workspaceStore.upsertChannelAgentSession({
      id: "cas_cap",
      workspaceId: env.workspaceId,
      channelId: channel.id,
      agentProfileId: coworker.id,
      logicalAguiThreadId: "thread_cap",
      currentGenerationId: null,
      lastDeliveredChannelSequence: 0,
      state: "active",
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    const channelRow = await workspaceStore.getChannel(channel.id);
    const highWater = Math.max(0, (channelRow?.nextSequence ?? 1) - 1);
    const overEnvelope = await workspace.advanceSessionDeliveryCursor({
      session,
      channelAgentSessionId: "cas_cap",
      deliveredThroughSequence: highWater,
      envelopeRecentDeltas: [],
      turnCreation: "confirmed",
    });
    expect(overEnvelope.ok).toBe(false);
  });
});
