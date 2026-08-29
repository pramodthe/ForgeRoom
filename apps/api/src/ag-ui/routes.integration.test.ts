import { describe, expect, it } from "vitest";
import { HttpAgent, type RunAgentParameters } from "@forgeroom/ag-ui/browser";
import { sessionResponseSchema } from "@forgeroom/contracts";
import { seedRuntime, withMigratedDatabase } from "@forgeroom/db/test-harness";
import type { TrueForgeClient } from "@forgeroom/trueforge";
import { loadApiEnv } from "../env";
import { createApiApp } from "../server";
import { createAuthService } from "../auth/service";
import { createMemoryAuthStore } from "../auth/store";
import { createPostgresWorkspaceStore } from "../workspace/postgres-store";
import { createMemoryWorkspaceStore } from "../workspace/store";
import { createWorkspaceService } from "../workspace/service";
import { stableChannelAgentSessionId } from "../workspace/session-provision";

const PASSWORD = "correct-horse-battery";

async function createAgUiTestApp() {
  const store = createMemoryWorkspaceStore();
  const env = loadApiEnv({
    NODE_ENV: "test",
    APP_ORIGIN: "http://localhost:5173",
    OWNER_EMAIL: "owner@example.test",
    OWNER_PASSWORD: PASSWORD,
    OWNER_USER_ID: "user_owner",
    OWNER_DISPLAY_NAME: "Owner",
    WORKSPACE_ID: "workspace_1",
  });
  const auth = createAuthService({ env, store: createMemoryAuthStore() });
  await auth.seedOwner();
  const workspace = createWorkspaceService({ store });
  const app = createApiApp({ env, auth, workspace });
  return { app, env, workspace, store };
}

function cookieFrom(response: Response, name: string): string | undefined {
  const header = response.headers.get("set-cookie");
  if (!header) {
    return undefined;
  }
  const match = header.match(new RegExp(`${name}=([^;]+)`));
  return match?.[1];
}

describe("AG-UI routes", () => {
  it("returns capabilities for an authenticated channel coworker", async () => {
    const { app, env, workspace, store } = await createAgUiTestApp();
    const login = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "owner@example.test", password: PASSWORD }),
    });
    const session = sessionResponseSchema.parse(await login.json());
    const cookie = cookieFrom(login, env.sessionCookieName);

    const channel = await workspace.createChannel(session, "workspace_1", {
      schemaVersion: 1,
      name: "Demo",
      mission_brief: "AG-UI demo",
      idempotency_key: "channel_demo",
    });
    if (!channel.ok) {
      throw new Error(channel.error.message);
    }
    const channelId = channel.value.id;
    const coworker = await workspace.seedCoworker({
      workspaceId: "workspace_1",
      createdBy: session.user.id,
      id: "coworker_operator",
      handle: "operator",
      name: "Operator",
      title: "Operator",
    });
    await workspace.addParticipant(session, channelId, {
      participant_type: "coworker",
      participant_id: coworker.id,
      role: "member",
      idempotency_key: "part_operator",
    });
    await store.upsertChannelAgentSession({
      id: stableChannelAgentSessionId(channelId, coworker.id),
      workspaceId: "workspace_1",
      channelId,
      agentProfileId: coworker.id,
      logicalAguiThreadId: `thread_${channelId}_${coworker.id}`,
      state: "active",
    });

    const response = await app.request(
      `/api/ag-ui/channels/${channelId}/coworkers/${coworker.id}/capabilities`,
      {
        headers: { cookie: `${env.sessionCookieName}=${cookie}` },
      },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      threadId: `thread_${channelId}_${coworker.id}`,
      resume: { enabled: true, via: "pause_group_service" },
      packages: { "@ag-ui/core": "0.0.57" },
    });
  });

  it("rejects AG-UI runs without CSRF and rejects forged resume payloads", async () => {
    const { app, env, workspace } = await createAgUiTestApp();
    const login = await app.request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "owner@example.test", password: PASSWORD }),
    });
    const session = sessionResponseSchema.parse(await login.json());
    const cookie = cookieFrom(login, env.sessionCookieName);
    const channel = await workspace.createChannel(session, "workspace_1", {
      schemaVersion: 1,
      name: "Demo",
      mission_brief: "AG-UI demo",
      idempotency_key: "channel_demo_2",
    });
    if (!channel.ok) {
      throw new Error(channel.error.message);
    }
    const channelId = channel.value.id;
    const coworker = await workspace.seedCoworker({
      workspaceId: "workspace_1",
      createdBy: session.user.id,
      id: "coworker_operator_2",
      handle: "operator2",
      name: "Operator",
      title: "Operator",
    });
    await workspace.addParticipant(session, channelId, {
      participant_type: "coworker",
      participant_id: coworker.id,
      role: "member",
      idempotency_key: "part_operator_2",
    });

    const missingCsrf = await app.request(
      `/api/ag-ui/channels/${channelId}/coworkers/${coworker.id}/runs`,
      {
        method: "POST",
        headers: {
          cookie: `${env.sessionCookieName}=${cookie}`,
          origin: env.appOrigin,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          threadId: `thread_${channelId}_${coworker.id}`,
          runId: "run_1",
          messages: [{ id: "m1", role: "user", content: "Hello" }],
          tools: [],
          context: [],
          state: {},
        }),
      },
    );
    expect(missingCsrf.status).toBe(403);

    const resumeRejected = await app.request(
      `/api/ag-ui/channels/${channelId}/coworkers/${coworker.id}/runs`,
      {
        method: "POST",
        headers: {
          cookie: `${env.sessionCookieName}=${cookie}`,
          origin: env.appOrigin,
          "x-csrf-token": session.csrf_token,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          threadId: `thread_${channelId}_${coworker.id}`,
          runId: "run_2",
          messages: [],
          tools: [],
          context: [],
          state: {},
          resume: [{ interruptId: "forged_interrupt", status: "resolved" }],
        }),
      },
    );
    expect(resumeRejected.status).toBe(400);
    await expect(resumeRejected.json()).resolves.toMatchObject({
      error: { code: "validation_failed" },
    });
  });

  it("streams through the official client with session guards and rejects a forged Origin", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await sql`
        INSERT INTO channel_participants (
          channel_id, participant_type, participant_id, role, joined_at
        )
        VALUES ('ch_1', 'coworker', 'cw_1', 'member', ${new Date().toISOString()})
      `;
      await sql`
        UPDATE agent_turns SET trueforge_turn_id = 'tf_turn_1' WHERE id = 'turn_1'
      `;

      const env = loadApiEnv({
        NODE_ENV: "test",
        APP_ORIGIN: "http://localhost:5173",
        OWNER_EMAIL: "owner@example.test",
        OWNER_PASSWORD: PASSWORD,
        OWNER_USER_ID: "user_1",
        OWNER_DISPLAY_NAME: "Owner",
        WORKSPACE_ID: "ws_1",
      });
      const auth = createAuthService({ env, store: createMemoryAuthStore() });
      await auth.seedOwner();
      const workspace = createWorkspaceService({
        store: createPostgresWorkspaceStore(sql),
        sql,
      });
      const trueforgeClient = {
        async listTurnEvents() {
          return [
            {
              type: "model.message.delta",
              id: "evt_delta_route",
              sequence_number: 1,
              text: "Official client response",
            },
            {
              type: "turn.done",
              id: "evt_done_route",
              sequence_number: 2,
              state: { required_actions: [] },
            },
          ];
        },
      } as unknown as TrueForgeClient;
      const app = createApiApp({ env, auth, workspace, trueforgeClient, sql });
      const login = await app.request("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "owner@example.test", password: PASSWORD }),
      });
      const session = sessionResponseSchema.parse(await login.json());
      const sessionCookie = cookieFrom(login, env.sessionCookieName);
      if (!sessionCookie) {
        throw new Error("login must return a session cookie");
      }

      const runInput: RunAgentParameters = {
        runId: "agui_run_1",
        forwardedProps: {
          forgeroomV1: {
            schemaVersion: 1,
            sourceMessageId: "msg_1",
            applicationRunId: "run_1",
            runStepId: "step_1",
          },
        },
      };
      const runBody = {
        threadId: "thread_1",
        runId: "agui_run_1",
        messages: [{ id: "msg_1", role: "user", content: "Please inspect" }],
        tools: [],
        context: [],
        state: {},
        forwardedProps: runInput.forwardedProps,
      };
      for (const headers of [
        {
          cookie: `${env.sessionCookieName}=${sessionCookie}`,
          origin: "https://forged.example",
          "x-csrf-token": session.csrf_token,
          "content-type": "application/json",
        },
        {
          cookie: `${env.sessionCookieName}=${sessionCookie}`,
          origin: env.appOrigin,
          "x-csrf-token": "forged-csrf-token",
          "content-type": "application/json",
        },
      ]) {
        const rejected = await app.request("/api/ag-ui/channels/ch_1/coworkers/cw_1/runs", {
          method: "POST",
          headers,
          body: JSON.stringify(runBody),
        });
        expect(rejected.status).toBe(403);
        await expect(rejected.json()).resolves.toMatchObject({ error: { code: "csrf_failed" } });
      }

      const createClient = () =>
        new HttpAgent({
          url: "http://forgeroom.test/api/ag-ui/channels/ch_1/coworkers/cw_1/runs",
          threadId: "thread_1",
          initialMessages: [{ id: "msg_1", role: "user", content: "Please inspect" }],
          headers: { "x-csrf-token": session.csrf_token },
          fetch: async (url, init) => {
            const headers = new Headers(init?.headers);
            headers.set("cookie", `${env.sessionCookieName}=${sessionCookie}`);
            headers.set("origin", env.appOrigin);
            return app.request(new URL(String(url)).pathname, { ...init, headers });
          },
        });

      const events: string[] = [];
      const result = await createClient().runAgent(runInput, {
        onEvent({ event }) {
          events.push(event.type);
        },
      });

      expect(events[0]).toBe("RUN_STARTED");
      expect(events).toContain("TEXT_MESSAGE_CONTENT");
      expect(events.at(-1)).toBe("RUN_FINISHED");
      expect(result.newMessages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: "assistant", content: "Official client response" }),
        ]),
      );
    });
  }, 60_000);
});
