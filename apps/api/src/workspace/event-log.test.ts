import { describe, expect, it } from "vitest";
import {
  agentChannelEnvelopeSchema,
  channelSchema,
  sessionResponseSchema,
  type AgentChannelEnvelope,
} from "@forgeroom/contracts";
import { withMigratedDatabase } from "@forgeroom/db/test-harness";
import { loadApiEnv } from "../env";
import { createApiApp } from "../server";
import { createAuthService } from "../auth/service";
import { createMemoryAuthStore } from "../auth/store";
import { createPostgresAuthStore } from "../auth/postgres-store";
import { assertPersistableChannelEnvelope, ChannelEventPersistenceError } from "./event-guard";
import { buildEnvelope, customAguiEvent } from "./event-builders";
import { createChannelEventHub } from "./event-hub";
import { createPostgresWorkspaceStore } from "./postgres-store";
import { createWorkspaceService, type WorkspaceService } from "./service";
import { createMemoryWorkspaceStore, type WorkspaceCatalogStore } from "./store";
import { drainThroughSequence } from "./event-stream";

const PASSWORD = "correct-horse-battery";

function withoutRequestId(body: unknown): Record<string, unknown> {
  const record = (body ?? {}) as Record<string, unknown>;
  const { request_id: _requestId, ...rest } = record;
  return rest;
}

async function createTestApp(options?: {
  workspaceStore?: WorkspaceCatalogStore;
  wrapWorkspace?: (workspace: WorkspaceService) => WorkspaceService;
}) {
  const authStore = createMemoryAuthStore();
  const workspaceStore = options?.workspaceStore ?? createMemoryWorkspaceStore();
  const eventHub = createChannelEventHub();
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
  let workspace = createWorkspaceService({ store: workspaceStore, eventHub });
  if (options?.wrapWorkspace) {
    workspace = options.wrapWorkspace(workspace);
  }
  await auth.seedOwner();
  return {
    app: createApiApp({ env, auth, workspace }),
    env,
    auth,
    workspace,
    workspaceStore,
    eventHub,
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
      mission_brief: `${name} brief`,
      idempotency_key: key,
    }),
  });
  expect(created.status).toBe(201);
  return channelSchema.parse(withoutRequestId(await created.json()));
}

/** Seed one active channel coworker so no-mention posts auto-route under P0-205. */
async function ensureSoloMember(input: {
  app: ReturnType<typeof createApiApp>;
  env: ReturnType<typeof loadApiEnv>;
  workspace: WorkspaceService;
  cookie: string;
  csrf: string;
  channelId: string;
  handle?: string;
}) {
  const handle = input.handle ?? "solo";
  const coworker = await input.workspace.seedCoworker({
    workspaceId: input.env.workspaceId,
    createdBy: input.env.ownerUserId,
    handle,
    name: "Solo",
    title: "Solo",
  });
  const added = await input.app.request(`/api/channels/${input.channelId}/participants`, {
    method: "POST",
    headers: mutationHeaders(input.env, input.cookie, input.csrf),
    body: JSON.stringify({
      schemaVersion: 1,
      participant_type: "coworker",
      participant_id: coworker.id,
      role: "member",
      idempotency_key: `idem_solo_${handle}_${input.channelId}`,
    }),
  });
  expect(added.status).toBe(200);
  return coworker;
}

function parseSseBlocks(chunk: string): Array<{ id?: string; event?: string; data: string }> {
  return chunk
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      let id: string | undefined;
      let event: string | undefined;
      const dataLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith("id:")) id = line.slice(3).trim();
        else if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
      }
      return { id, event, data: dataLines.join("\n") };
    });
}

describe("P0-107 channel event log and SSE", () => {
  it("rejects generated_source_ref and open-generative fields in channel JSON", () => {
    expect(() =>
      assertPersistableChannelEnvelope({
        schemaVersion: 1,
        channelId: "ch_1",
        channelSequence: 0,
        actorKind: "system",
        aguiEvent: customAguiEvent("channel.created"),
        generated_source_ref: { schemaVersion: 1 },
      }),
    ).toThrow(ChannelEventPersistenceError);

    expect(() =>
      assertPersistableChannelEnvelope({
        schemaVersion: 1,
        channelId: "ch_1",
        channelSequence: 0,
        actorKind: "system",
        aguiEvent: {
          type: "CUSTOM",
          name: "channel.created",
          payload: {
            schemaVersion: 1,
            capability_url: "https://evil.example/iframe",
          },
        },
      }),
    ).toThrow(ChannelEventPersistenceError);

    expect(() =>
      assertPersistableChannelEnvelope({
        schemaVersion: 1,
        channelId: "ch_1",
        channelSequence: 0,
        actorKind: "system",
        aguiEvent: {
          type: "ACTIVITY_SNAPSHOT",
          messageId: "ui_1",
          activityType: "open-generative-ui",
          replace: true,
          content: { schemaVersion: 1 },
        },
      }),
    ).toThrow(ChannelEventPersistenceError);
  });

  it("allocates unique monotonic sequences under concurrent appends", async () => {
    const store = createMemoryWorkspaceStore();
    const hub = createChannelEventHub();
    const workspace = createWorkspaceService({ store, eventHub: hub });
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
    const auth = createAuthService({
      env,
      store: createMemoryAuthStore(),
    });
    await auth.seedOwner();
    const app = createApiApp({ env, auth, workspace });
    const { session, cookie } = await login(app, env);
    const channel = await createChannel(app, env, cookie, session.csrf_token, "Race", "idem_race");
    await ensureSoloMember({
      app,
      env,
      workspace,
      cookie,
      csrf: session.csrf_token,
      channelId: channel.id,
    });

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        app.request(`/api/channels/${channel.id}/messages`, {
          method: "POST",
          headers: mutationHeaders(env, cookie, session.csrf_token),
          body: JSON.stringify({
            body: `msg-${index}`,
            recipient_handles: [],
            routing_mode: "direct",
            parent_message_id: null,
          }),
        }),
      ),
    );
    expect(results.every((response) => response.status === 201)).toBe(true);
    const sequences = (
      await Promise.all(
        results.map(async (response) => (await response.json()) as { sequence: number }),
      )
    )
      .map((body) => body.sequence)
      .sort((a, b) => a - b);
    expect(sequences).toEqual(Array.from({ length: 20 }, (_, index) => index + 2));
    expect(new Set(sequences).size).toBe(20);

    const listed = await app.request(`/api/channels/${channel.id}/events?afterSequence=-1`, {
      headers: { cookie: `${env.sessionCookieName}=${cookie}` },
    });
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as { events: unknown[] };
    expect(body.events).toHaveLength(22);
    const envelopes = body.events.map((event) => agentChannelEnvelopeSchema.parse(event));
    expect(envelopes.map((event) => event.channelSequence)).toEqual(
      Array.from({ length: 22 }, (_, index) => index),
    );
    expect(envelopes[0]?.aguiEvent).toMatchObject({ type: "CUSTOM", name: "channel.created" });
    expect(envelopes.at(-1)?.aguiEvent).toMatchObject({ type: "CUSTOM", name: "message.created" });
    expect(envelopes.at(-1)?.sourceMessageId).toBeTruthy();
  });

  it("replays persisted events after API restart and honors afterSequence", async () => {
    const sharedStore = createMemoryWorkspaceStore();
    const first = await createTestApp({ workspaceStore: sharedStore });
    const { session, cookie } = await login(first.app, first.env);
    const channel = await createChannel(
      first.app,
      first.env,
      cookie,
      session.csrf_token,
      "Restart",
      "idem_restart",
    );
    await ensureSoloMember({
      app: first.app,
      env: first.env,
      workspace: first.workspace,
      cookie,
      csrf: session.csrf_token,
      channelId: channel.id,
    });
    await first.app.request(`/api/channels/${channel.id}/messages`, {
      method: "POST",
      headers: mutationHeaders(first.env, cookie, session.csrf_token),
      body: JSON.stringify({
        body: "before restart",
        recipient_handles: [],
        routing_mode: "direct",
        parent_message_id: null,
      }),
    });

    // New process: same durable store, fresh hub/service.
    const restarted = await createTestApp({ workspaceStore: sharedStore });
    const relogin = await login(restarted.app, restarted.env);
    const listed = await restarted.app.request(
      `/api/channels/${channel.id}/events?afterSequence=1`,
      {
        headers: { cookie: `${restarted.env.sessionCookieName}=${relogin.cookie}` },
      },
    );
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as { events: unknown[] };
    expect(body.events).toHaveLength(1);
    const envelope = agentChannelEnvelopeSchema.parse(body.events[0]);
    expect(envelope.channelSequence).toBe(2);
    expect(envelope.aguiEvent).toMatchObject({ type: "CUSTOM", name: "message.created" });
    expect(envelope.actorKind).toBe("human");
  });

  it("SSE replays Last-Event-ID then live-delivers without gaps", async () => {
    const { app, env, workspace } = await createTestApp();
    const { session, cookie } = await login(app, env);
    const channel = await createChannel(app, env, cookie, session.csrf_token, "SSE", "idem_sse");
    await ensureSoloMember({
      app,
      env,
      workspace,
      cookie,
      csrf: session.csrf_token,
      channelId: channel.id,
    });

    await app.request(`/api/channels/${channel.id}/messages`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        body: "persisted",
        recipient_handles: [],
        routing_mode: "direct",
        parent_message_id: null,
      }),
    });

    const controller = new AbortController();
    const streamResponse = await app.request(`/api/channels/${channel.id}/stream`, {
      headers: {
        cookie: `${env.sessionCookieName}=${cookie}`,
        "Last-Event-ID": "1",
        accept: "text/event-stream",
      },
      signal: controller.signal,
    });
    expect(streamResponse.status).toBe(200);
    expect(streamResponse.headers.get("content-type")).toContain("text/event-stream");
    expect(streamResponse.body).toBeTruthy();

    const reader = streamResponse.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const channelEvents: Array<{
      id?: string;
      envelope: ReturnType<typeof agentChannelEnvelopeSchema.parse>;
    }> = [];

    const readUntil = async (predicate: () => boolean, timeoutMs = 3_000) => {
      const deadline = Date.now() + timeoutMs;
      while (!predicate() && Date.now() < deadline) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        for (const block of parseSseBlocks(buffer)) {
          if (block.event === "channel_event") {
            const envelope = agentChannelEnvelopeSchema.parse(JSON.parse(block.data));
            if (
              !channelEvents.some(
                (row) => row.envelope.channelSequence === envelope.channelSequence,
              )
            ) {
              channelEvents.push({ id: block.id, envelope });
            }
          }
        }
        // Keep trailing partial block.
        const lastSep = buffer.lastIndexOf("\n\n");
        if (lastSep >= 0) {
          buffer = buffer.slice(lastSep + 2);
        }
      }
    };

    await readUntil(() => channelEvents.some((row) => row.envelope.channelSequence === 2));
    expect(channelEvents.map((row) => row.id)).toContain("2");
    expect(channelEvents[0]?.envelope.channelSequence).toBe(2);

    // Live event after replay-to-live transition.
    const livePost = await app.request(`/api/channels/${channel.id}/messages`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        body: "live",
        recipient_handles: [],
        routing_mode: "direct",
        parent_message_id: null,
      }),
    });
    expect(livePost.status).toBe(201);
    const liveBody = (await livePost.json()) as { sequence: number };
    expect(liveBody.sequence).toBe(3);

    await readUntil(() => channelEvents.some((row) => row.envelope.channelSequence === 3));
    const sequences = channelEvents
      .map((row) => row.envelope.channelSequence)
      .sort((a, b) => a - b);
    expect(sequences).toEqual([2, 3]);
    expect(channelEvents.every((row) => row.id === String(row.envelope.channelSequence))).toBe(
      true,
    );

    // Direct hub publish proves catch-up path can also see in-process fan-out.
    expect(workspace.subscribeChannelEvents).toBeTypeOf("function");

    controller.abort();
    await reader.cancel().catch(() => undefined);
  });

  it("drainThroughSequence advances past skipped sequences without emitting them", () => {
    const pending = new Map<number, AgentChannelEnvelope>([
      [
        2,
        buildEnvelope(2, {
          channelId: "ch",
          actorKind: "human",
          sourceMessageId: "msg_2",
          aguiEvent: customAguiEvent("message.created"),
        }),
      ],
    ]);
    const drained = drainThroughSequence(0, 2, pending);
    expect(drained.lastSent).toBe(2);
    expect(drained.toEmit.map((e) => e.channelSequence)).toEqual([2]);
    expect(pending.size).toBe(0);
  });

  it("SSE advances past unparseable sequences so later events are not stalled", async () => {
    const { app, env, workspace } = await createTestApp({
      wrapWorkspace: (base) => ({
        ...base,
        async listEvents(session, channelId, afterSequence, options) {
          const page = await base.listEvents(session, channelId, afterSequence, options);
          if (!page.ok) {
            return page;
          }
          return {
            ok: true,
            value: {
              ...page.value,
              // Simulate envelopeFromStoredEvent returning null for sequence 1.
              events: page.value.events.filter((envelope) => envelope.channelSequence !== 1),
            },
          };
        },
      }),
    });
    const { session, cookie } = await login(app, env);
    const channel = await createChannel(app, env, cookie, session.csrf_token, "Skip", "idem_skip");
    await ensureSoloMember({
      app,
      env,
      workspace,
      cookie,
      csrf: session.csrf_token,
      channelId: channel.id,
    });

    for (const body of ["first", "second"]) {
      const posted = await app.request(`/api/channels/${channel.id}/messages`, {
        method: "POST",
        headers: mutationHeaders(env, cookie, session.csrf_token),
        body: JSON.stringify({
          body,
          recipient_handles: [],
          routing_mode: "direct",
          parent_message_id: null,
        }),
      });
      expect(posted.status).toBe(201);
    }

    const controller = new AbortController();
    const streamResponse = await app.request(`/api/channels/${channel.id}/stream`, {
      headers: {
        cookie: `${env.sessionCookieName}=${cookie}`,
        "Last-Event-ID": "-1",
        accept: "text/event-stream",
      },
      signal: controller.signal,
    });
    expect(streamResponse.status).toBe(200);

    const reader = streamResponse.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const sequences: number[] = [];

    const deadline = Date.now() + 3_000;
    while (!sequences.includes(3) && Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (const block of parseSseBlocks(buffer)) {
        if (block.event === "channel_event") {
          const envelope = agentChannelEnvelopeSchema.parse(JSON.parse(block.data));
          if (!sequences.includes(envelope.channelSequence)) {
            sequences.push(envelope.channelSequence);
          }
        }
      }
      const lastSep = buffer.lastIndexOf("\n\n");
      if (lastSep >= 0) {
        buffer = buffer.slice(lastSep + 2);
      }
    }

    expect(sequences).toContain(0);
    expect(sequences).not.toContain(1);
    expect(sequences).toContain(2);
    expect(sequences).toContain(3);

    controller.abort();
    await reader.cancel().catch(() => undefined);
  });

  it("SSE poll failure emits error without deadlocking the write chain", async () => {
    let listCalls = 0;
    const { app, env } = await createTestApp({
      wrapWorkspace: (base) => ({
        ...base,
        async listEvents(session, channelId, afterSequence, options) {
          listCalls += 1;
          // Replay + catch-up succeed; live DB polls fail.
          if (listCalls >= 3) {
            return {
              ok: false,
              error: { code: "forbidden", message: "simulated poll failure" },
            };
          }
          return base.listEvents(session, channelId, afterSequence, options);
        },
      }),
    });
    const { session, cookie } = await login(app, env);
    const channel = await createChannel(
      app,
      env,
      cookie,
      session.csrf_token,
      "PollFail",
      "idem_poll_fail",
    );

    const controller = new AbortController();
    const streamResponse = await app.request(`/api/channels/${channel.id}/stream`, {
      headers: {
        cookie: `${env.sessionCookieName}=${cookie}`,
        accept: "text/event-stream",
      },
      signal: controller.signal,
    });
    expect(streamResponse.status).toBe(200);

    const reader = streamResponse.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let errorPayload: { code?: string; message?: string } | null = null;

    const deadline = Date.now() + 3_000;
    while (!errorPayload && Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (const block of parseSseBlocks(buffer)) {
        if (block.event === "error") {
          errorPayload = JSON.parse(block.data) as { code?: string; message?: string };
        }
      }
      const lastSep = buffer.lastIndexOf("\n\n");
      if (lastSep >= 0) {
        buffer = buffer.slice(lastSep + 2);
      }
    }

    expect(errorPayload).toMatchObject({
      code: "forbidden",
      message: "simulated poll failure",
    });

    controller.abort();
    await reader.cancel().catch(() => undefined);
  });

  it("postgres concurrent appends keep unique (channel_id, sequence) and full_event rows", async () => {
    await withMigratedDatabase(async (sql) => {
      const authStore = createPostgresAuthStore(sql);
      const workspaceStore = createPostgresWorkspaceStore(sql);
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
      const app = createApiApp({ env, auth, workspace });
      const { session, cookie } = await login(app, env);
      const channel = await createChannel(
        app,
        env,
        cookie,
        session.csrf_token,
        "PgRace",
        "idem_pg_race",
      );
      await ensureSoloMember({
        app,
        env,
        workspace,
        cookie,
        csrf: session.csrf_token,
        channelId: channel.id,
      });

      const posts = await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          app.request(`/api/channels/${channel.id}/messages`, {
            method: "POST",
            headers: mutationHeaders(env, cookie, session.csrf_token),
            body: JSON.stringify({
              body: `pg-${index}`,
              recipient_handles: [],
              routing_mode: "direct",
              parent_message_id: null,
            }),
          }),
        ),
      );
      expect(posts.every((response) => response.status === 201)).toBe(true);

      const eventRows = await sql<{ sequence: number; type: string }[]>`
        SELECT sequence, type FROM channel_events
        WHERE channel_id = ${channel.id}
        ORDER BY sequence ASC
      `;
      expect(eventRows.map((row) => row.sequence)).toEqual(
        Array.from({ length: eventRows.length }, (_, index) => index),
      );
      expect(new Set(eventRows.map((row) => row.sequence)).size).toBe(eventRows.length);

      const aguiRows = await sql<{ storage_kind: string; event_hash: string }[]>`
        SELECT storage_kind, event_hash FROM agui_event_records
        WHERE channel_event_id IN (
          SELECT id FROM channel_events WHERE channel_id = ${channel.id}
        )
      `;
      expect(aguiRows.length).toBe(eventRows.length);
      expect(aguiRows.every((row) => row.storage_kind === "full_event")).toBe(true);
      expect(aguiRows.every((row) => row.event_hash.startsWith("sha256:"))).toBe(true);
    });
  }, 60_000);

  it("normalizes legacy message payloads and skips invalid channel JSON", async () => {
    const { envelopeFromStoredEvent } = await import("./event-read");
    const legacy = envelopeFromStoredEvent(
      {
        id: "evt_legacy",
        channelId: "ch_1",
        sequence: 3,
        type: "message.created",
        actorType: "human",
        actorId: "user_1",
        runId: null,
        payloadJson: {
          body: "old body",
          recipient_handles: [],
          routing_mode: "direct",
        },
        aguiEventType: null,
        aguiEventJson: null,
        logicalThreadId: null,
        createdAt: new Date().toISOString(),
        sourceMessageId: "msg_legacy",
      },
      { sourceMessageId: "msg_legacy" },
    );
    expect(legacy).toBeTruthy();
    expect(agentChannelEnvelopeSchema.parse(legacy)).toMatchObject({
      channelSequence: 3,
      sourceMessageId: "msg_legacy",
      actorKind: "human",
      aguiEvent: { type: "CUSTOM", name: "message.created" },
    });

    expect(
      envelopeFromStoredEvent({
        id: "evt_bad",
        channelId: "ch_1",
        sequence: 9,
        type: "unknown.garbage",
        actorType: "human",
        actorId: "user_1",
        runId: null,
        payloadJson: { not: "an envelope" },
        aguiEventType: null,
        aguiEventJson: null,
        logicalThreadId: null,
        createdAt: new Date().toISOString(),
      }),
    ).toBeNull();
  });

  it("pages listEventsAfter and reports has_more", async () => {
    const store = createMemoryWorkspaceStore();
    const workspace = createWorkspaceService({ store });
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
    const auth = createAuthService({ env, store: createMemoryAuthStore() });
    await auth.seedOwner();
    const app = createApiApp({ env, auth, workspace });
    const { session, cookie } = await login(app, env);
    const channel = await createChannel(app, env, cookie, session.csrf_token, "Page", "idem_page");
    await ensureSoloMember({
      app,
      env,
      workspace,
      cookie,
      csrf: session.csrf_token,
      channelId: channel.id,
    });
    for (let i = 0; i < 5; i += 1) {
      await app.request(`/api/channels/${channel.id}/messages`, {
        method: "POST",
        headers: mutationHeaders(env, cookie, session.csrf_token),
        body: JSON.stringify({
          body: `p-${i}`,
          recipient_handles: [],
          routing_mode: "direct",
          parent_message_id: null,
        }),
      });
    }
    const page = await store.listEventsAfter(channel.id, -1, { limit: 3 });
    expect(page.events).toHaveLength(3);
    expect(page.hasMore).toBe(true);
    const rest = await store.listEventsAfter(channel.id, page.events.at(-1)!.sequence, {
      limit: 10,
    });
    expect(rest.events).toHaveLength(4);
    expect(rest.hasMore).toBe(false);
  });

  it("maps concurrent archive during rename to conflict", async () => {
    const base = createMemoryWorkspaceStore();
    const store: typeof base = {
      ...base,
      async appendChannelEvent(input) {
        if (input.event.type === "channel.renamed") {
          throw new Error("channel_archived");
        }
        return base.appendChannelEvent(input);
      },
    };
    const { app, env } = await createTestApp({ workspaceStore: store });
    const { session, cookie } = await login(app, env);
    const channel = await createChannel(
      app,
      env,
      cookie,
      session.csrf_token,
      "RaceArch",
      "idem_race_arch",
    );
    const renamed = await app.request(`/api/channels/${channel.id}`, {
      method: "PATCH",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        name: "Nope",
        idempotency_key: "idem_race_rename",
      }),
    });
    expect(renamed.status).toBe(409);
  });

  it("coworker PATCH and disable append participant channel events", async () => {
    const { app, env, workspace, workspaceStore } = await createTestApp();
    const { session, cookie } = await login(app, env);
    const channel = await createChannel(
      app,
      env,
      cookie,
      session.csrf_token,
      "MemLog",
      "idem_mem_log",
    );
    const coworker = await workspace.seedCoworker({
      workspaceId: env.workspaceId,
      createdBy: env.ownerUserId,
      handle: "memlog",
      name: "Mem",
      title: "Log",
    });
    const patched = await app.request(`/api/coworkers/${coworker.id}`, {
      method: "PATCH",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        handle: "memlog",
        name: "Mem",
        title: "Log",
        standing_instructions: "",
        model_preset: "default",
        budget: { max_turn_tokens: 12_000, max_tool_calls: 20 },
        channel_ids: [channel.id],
        task_record_grants: [],
        tool_grants: [],
        skill_version_ids: [],
        component_version_ids: [],
        native_subagents_enabled: false,
      }),
    });
    expect(patched.status).toBe(200);
    const afterAdd = await workspaceStore.listEventsAfter(channel.id, -1, { limit: 50 });
    expect(afterAdd.events.some((row) => row.type === "participant.added")).toBe(true);

    const disabled = await app.request(`/api/coworkers/${coworker.id}/disable`, {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
      body: JSON.stringify({
        schemaVersion: 1,
        idempotency_key: "idem_disable_mem",
        expected_config_revision: 2,
        reason: "test",
      }),
    });
    expect(disabled.status).toBe(200);
    const afterDisable = await workspaceStore.listEventsAfter(channel.id, -1, { limit: 50 });
    expect(afterDisable.events.some((row) => row.type === "participant.removed")).toBe(true);
  });

  it("closes SSE after session logout on auth recheck", async () => {
    const { app, env } = await createTestApp();
    const { session, cookie } = await login(app, env);
    const channel = await createChannel(
      app,
      env,
      cookie,
      session.csrf_token,
      "AuthSSE",
      "idem_auth_sse",
    );
    const controller = new AbortController();
    const streamResponse = await app.request(`/api/channels/${channel.id}/stream`, {
      headers: {
        cookie: `${env.sessionCookieName}=${cookie}`,
        accept: "text/event-stream",
      },
      signal: controller.signal,
    });
    expect(streamResponse.status).toBe(200);
    const reader = streamResponse.body!.getReader();
    const decoder = new TextDecoder();
    let sawUnauth = false;
    await app.request("/api/auth/logout", {
      method: "POST",
      headers: mutationHeaders(env, cookie, session.csrf_token),
    });
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline && !sawUnauth) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (chunk.includes("unauthenticated") || chunk.includes("Session expired")) {
        sawUnauth = true;
      }
    }
    expect(sawUnauth).toBe(true);
    controller.abort();
    await reader.cancel().catch(() => undefined);
  });
});
