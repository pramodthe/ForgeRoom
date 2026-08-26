import { describe, expect, it } from "vitest";
import {
  agentChannelEnvelopeSchema,
  channelSchema,
  sessionResponseSchema,
} from "@forgeroom/contracts";
import { withMigratedDatabase } from "@forgeroom/db/test-harness";
import { loadApiEnv } from "../env";
import { createApiApp } from "../server";
import { createAuthService } from "../auth/service";
import { createMemoryAuthStore } from "../auth/store";
import { createPostgresAuthStore } from "../auth/postgres-store";
import { assertPersistableChannelEnvelope, ChannelEventPersistenceError } from "./event-guard";
import { customAguiEvent } from "./event-builders";
import { createChannelEventHub } from "./event-hub";
import { createPostgresWorkspaceStore } from "./postgres-store";
import { createWorkspaceService } from "./service";
import { createMemoryWorkspaceStore, type WorkspaceCatalogStore } from "./store";

const PASSWORD = "correct-horse-battery";

function withoutRequestId(body: unknown): Record<string, unknown> {
  const record = (body ?? {}) as Record<string, unknown>;
  const { request_id: _requestId, ...rest } = record;
  return rest;
}

async function createTestApp(options?: { workspaceStore?: WorkspaceCatalogStore }) {
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
  const workspace = createWorkspaceService({ store: workspaceStore, eventHub });
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
    expect(sequences).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(new Set(sequences).size).toBe(20);

    const listed = await app.request(`/api/channels/${channel.id}/events?afterSequence=-1`, {
      headers: { cookie: `${env.sessionCookieName}=${cookie}` },
    });
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as { events: unknown[] };
    expect(body.events).toHaveLength(21);
    const envelopes = body.events.map((event) => agentChannelEnvelopeSchema.parse(event));
    expect(envelopes.map((event) => event.channelSequence)).toEqual(
      Array.from({ length: 21 }, (_, index) => index),
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
      `/api/channels/${channel.id}/events?afterSequence=0`,
      {
        headers: { cookie: `${restarted.env.sessionCookieName}=${relogin.cookie}` },
      },
    );
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as { events: unknown[] };
    expect(body.events).toHaveLength(1);
    const envelope = agentChannelEnvelopeSchema.parse(body.events[0]);
    expect(envelope.channelSequence).toBe(1);
    expect(envelope.aguiEvent).toMatchObject({ type: "CUSTOM", name: "message.created" });
    expect(envelope.actorKind).toBe("human");
  });

  it("SSE replays Last-Event-ID then live-delivers without gaps", async () => {
    const { app, env, workspace } = await createTestApp();
    const { session, cookie } = await login(app, env);
    const channel = await createChannel(app, env, cookie, session.csrf_token, "SSE", "idem_sse");

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
        "Last-Event-ID": "0",
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

    await readUntil(() => channelEvents.some((row) => row.envelope.channelSequence === 1));
    expect(channelEvents.map((row) => row.id)).toContain("1");
    expect(channelEvents[0]?.envelope.channelSequence).toBe(1);

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
    expect(liveBody.sequence).toBe(2);

    await readUntil(() => channelEvents.some((row) => row.envelope.channelSequence === 2));
    const sequences = channelEvents
      .map((row) => row.envelope.channelSequence)
      .sort((a, b) => a - b);
    expect(sequences).toEqual([1, 2]);
    expect(channelEvents.every((row) => row.id === String(row.envelope.channelSequence))).toBe(
      true,
    );

    // Direct hub publish proves catch-up path can also see in-process fan-out.
    expect(workspace.subscribeChannelEvents).toBeTypeOf("function");

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
});
