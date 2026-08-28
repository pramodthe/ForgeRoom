import { describe, expect, it, vi } from "vitest";
import { TrueForgeClient } from "@forgeroom/trueforge";
import { setComponentGrant } from "@forgeroom/db";
import { NOW, seedRuntime, withMigratedDatabase } from "@forgeroom/db/test-harness";
import { createMemoryWorkspaceStore } from "./store";
import { createPostgresWorkspaceStore } from "./postgres-store";
import {
  ensureCoworkerChannelSession,
  initialSessionGenerationId,
  stableChannelAgentSessionId,
} from "./session-provision";
import { loadApiEnv } from "../env";

describe("ensureCoworkerChannelSession", () => {
  it("provisions distinct TrueForge sessions per coworker and stores hashes", async () => {
    const store = createMemoryWorkspaceStore();
    let n = 0;
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "POST" && url.endsWith("/api/v1/sessions")) {
        n += 1;
        const id = n === 1 ? "tf_sess_operator" : "tf_sess_research";
        return new Response(
          JSON.stringify({
            data: {
              id,
              agent: {},
              title: null,
              created_by: "local",
              created_at: "2026-08-26T00:00:00.000Z",
              updated_at: "2026-08-26T00:00:00.000Z",
            },
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }
      const id = url.includes("tf_sess_research") ? "tf_sess_research" : "tf_sess_operator";
      return new Response(
        JSON.stringify({
          data: {
            id,
            agent: {},
            title: null,
            created_by: "local",
            created_at: "2026-08-26T00:00:00.000Z",
            updated_at: "2026-08-26T00:00:00.000Z",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const client = new TrueForgeClient({
      baseUrl: "http://127.0.0.1:8790",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const operator = await ensureCoworkerChannelSession({
      store,
      workspaceId: "workspace_1",
      channelId: "ch_demo_general",
      createdBy: "user_owner",
      client,
      coworker: {
        id: "cw_demo_operator",
        workspaceId: "workspace_1",
        handle: "operator",
        name: "Operator",
        title: "Demo operator coworker",
        avatarSeed: null,
        visibility: "workspace",
        status: "active",
        editableConfigJson: {
          standing_instructions: "Help.",
          model_preset: "openai/gpt-5-4-mini",
          budget: { max_turn_tokens: 12000, max_tool_calls: 20 },
          channel_ids: [],
          task_record_grants: [],
          tool_grants: [],
          skill_version_ids: [],
          component_version_ids: [],
          sandbox: true,
        },
        currentVersionId: "av_demo_operator_v1",
        configRevision: 1,
        nativeSubagentsEnabled: false,
        createdAt: "2026-08-26T00:00:00.000Z",
        updatedAt: "2026-08-26T00:00:00.000Z",
      },
    });

    const research = await ensureCoworkerChannelSession({
      store,
      workspaceId: "workspace_1",
      channelId: "ch_demo_general",
      createdBy: "user_owner",
      client,
      coworker: {
        id: "cw_demo_research",
        workspaceId: "workspace_1",
        handle: "research",
        name: "Research",
        title: "Reader",
        avatarSeed: null,
        visibility: "workspace",
        status: "active",
        editableConfigJson: {
          standing_instructions: "",
          model_preset: "openai/gpt-5-4-mini",
          budget: { max_turn_tokens: 12000, max_tool_calls: 20 },
          channel_ids: [],
          task_record_grants: [],
          tool_grants: [],
          skill_version_ids: [],
          component_version_ids: [],
          sandbox: false,
        },
        currentVersionId: "av_demo_research_v1",
        configRevision: 1,
        nativeSubagentsEnabled: false,
        createdAt: "2026-08-26T00:00:00.000Z",
        updatedAt: "2026-08-26T00:00:00.000Z",
      },
    });

    expect(operator.trueforgeSessionId).toBe("tf_sess_operator");
    expect(research.trueforgeSessionId).toBe("tf_sess_research");
    expect(operator.trueforgeSessionId).not.toBe(research.trueforgeSessionId);
    expect(operator.revision.effectiveSpecHash.startsWith("sha256:")).toBe(true);
    expect(operator.revision.approvalPolicyHash.startsWith("sha256:")).toBe(true);
    expect(operator.revision.agentSpec.config.dynamic_sub_agents.enabled).toBe(false);
    expect(operator.logicalSession.currentGenerationId).toBe(operator.generationId);

    const sessions = await store.listChannelAgentSessions("ch_demo_general");
    expect(sessions).toHaveLength(2);
    expect(sessions.every((row) => row.currentGenerationId)).toBe(true);
  });

  it("registers the generation MCP connector before initial TrueForge provisioning", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await sql`
        INSERT INTO channels (
          id, workspace_id, name, mission_brief, next_sequence, status, created_by, created_at, updated_at
        ) VALUES ('ch_initial_mcp', 'ws_1', 'Initial MCP', 'Provision components', 0, 'active', 'user_1', ${NOW}, ${NOW})
      `;
      await setComponentGrant(sql, {
        componentVersionId: "compv_1",
        workspaceId: "ws_1",
        channelId: null,
        agentProfileId: "cw_1",
        grantedBy: "user_1",
      });

      let registeredConnectorName: string | null = null;
      const callOrder: string[] = [];
      const fetchImpl = vi.fn(async (request: string | URL, init?: RequestInit) => {
        const url = String(request);
        if (init?.method === "PUT" && url.endsWith("/api/v1/settings/mcp-servers")) {
          callOrder.push("register");
          const body = JSON.parse(String(init.body)) as { manifest: { name: string; url: string } };
          registeredConnectorName = body.manifest.name;
          return new Response(
            JSON.stringify({
              data: {
                name: body.manifest.name,
                manifest: {
                  type: "remote",
                  name: body.manifest.name,
                  url: body.manifest.url,
                  description: "components",
                  auth: { type: "header", headers: { "x-forgeroom-mcp-token": "***" } },
                },
                auth_status: { status: "authenticated" },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (init?.method === "GET" && url.includes("/api/v1/sessions?")) {
          callOrder.push("reconcile");
          return new Response(JSON.stringify({ data: [], pagination: { next_page_token: null } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (init?.method === "POST" && url.endsWith("/api/v1/sessions")) {
          callOrder.push("create-session");
          const body = JSON.parse(String(init.body)) as {
            agent: { spec: { mcp_servers?: Array<{ name: string }> } };
          };
          expect(body.agent.spec.mcp_servers?.map((server) => server.name)).toContain(
            registeredConnectorName,
          );
          return new Response(
            JSON.stringify({
              data: {
                id: "tf_initial_mcp",
                agent: {},
                title: null,
                created_by: "local",
                created_at: NOW,
                updated_at: NOW,
              },
            }),
            { status: 201, headers: { "Content-Type": "application/json" } },
          );
        }
        if (init?.method === "GET" && url.endsWith("/api/v1/sessions/tf_initial_mcp")) {
          return new Response(
            JSON.stringify({
              data: {
                id: "tf_initial_mcp",
                agent: {},
                title: null,
                created_by: "local",
                created_at: NOW,
                updated_at: NOW,
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        throw new Error(`unexpected TrueForge request: ${init?.method ?? "GET"} ${url}`);
      });
      const client = new TrueForgeClient({
        baseUrl: "http://trueforge.test",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      const store = createPostgresWorkspaceStore(sql);
      const coworker = await store.getCoworker("cw_1");
      expect(coworker).toBeTruthy();
      const env = loadApiEnv({
        NODE_ENV: "test",
        APP_ORIGIN: "http://localhost:5173",
        OWNER_EMAIL: "owner@example.test",
        OWNER_PASSWORD: "correct-horse-battery",
        OWNER_USER_ID: "user_1",
        OWNER_DISPLAY_NAME: "Owner",
        WORKSPACE_ID: "ws_1",
        AUTH_STORE: "postgres",
        UI_COMPONENTS_MCP_SECRET: "test-ui-components-mcp-secret-that-is-long-enough",
      });

      const provisioned = await ensureCoworkerChannelSession({
        store,
        workspaceId: "ws_1",
        channelId: "ch_initial_mcp",
        coworker: coworker!,
        createdBy: "user_1",
        client,
        sql,
        apiEnv: env,
      });

      expect(callOrder).toEqual(["register", "reconcile", "create-session"]);
      expect(registeredConnectorName).toBe(`ui_components_v1__${provisioned.generationId}`);
      expect(provisioned.trueforgeSessionId).toBe("tf_initial_mcp");
    });
  }, 60_000);

  it("serializes concurrent initial provisioning and allocates one revision and provider session", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await sql`
        INSERT INTO channels (
          id, workspace_id, name, mission_brief, next_sequence, status, created_by, created_at, updated_at
        ) VALUES ('ch_concurrent_provision', 'ws_1', 'Concurrent', 'Provision once', 0, 'active', 'user_1', ${NOW}, ${NOW})
      `;
      const store = createPostgresWorkspaceStore(sql);
      const coworker = await store.getCoworker("cw_1");
      expect(coworker).toBeTruthy();
      let postCalls = 0;
      const fetchImpl = vi.fn(async (request: string | URL, init?: RequestInit) => {
        const url = String(request);
        if (init?.method === "GET" && url.includes("/api/v1/sessions?")) {
          return new Response(JSON.stringify({ data: [], pagination: { next_page_token: null } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (init?.method === "POST" && url.endsWith("/api/v1/sessions")) {
          postCalls += 1;
          await new Promise((resolve) => setTimeout(resolve, 50));
          return new Response(
            JSON.stringify({
              data: {
                id: "tf_concurrent_once",
                agent: {},
                title: null,
                created_by: "local",
                created_at: NOW,
                updated_at: NOW,
              },
            }),
            { status: 201, headers: { "Content-Type": "application/json" } },
          );
        }
        if (init?.method === "GET" && url.endsWith("/api/v1/sessions/tf_concurrent_once")) {
          return new Response(
            JSON.stringify({
              data: {
                id: "tf_concurrent_once",
                agent: {},
                title: null,
                created_by: "local",
                created_at: NOW,
                updated_at: NOW,
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        throw new Error(`unexpected TrueForge request: ${init?.method ?? "GET"} ${url}`);
      });
      const client = new TrueForgeClient({
        baseUrl: "http://trueforge.test",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      const provision = () =>
        ensureCoworkerChannelSession({
          store,
          workspaceId: "ws_1",
          channelId: "ch_concurrent_provision",
          coworker: coworker!,
          createdBy: "user_1",
          client,
          sql,
        });

      const [first, second] = await Promise.all([provision(), provision()]);
      expect(postCalls).toBe(1);
      expect(first.generationId).toBe(second.generationId);
      const logicalSessionId = stableChannelAgentSessionId("ch_concurrent_provision", "cw_1");
      const generations = await sql<{ count: string }[]>`
        SELECT COUNT(*)::text AS count
        FROM channel_agent_session_generations
        WHERE channel_agent_session_id = ${logicalSessionId}
      `;
      expect(Number(generations[0]?.count ?? 0)).toBe(1);
    });
  }, 60_000);

  it("recovers a crash-marked initial attempt with the same discoverable generation", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await sql`
        INSERT INTO channels (
          id, workspace_id, name, mission_brief, next_sequence, status, created_by, created_at, updated_at
        ) VALUES ('ch_crash_recovery', 'ws_1', 'Recovery', 'Resume provisioning', 0, 'active', 'user_1', ${NOW}, ${NOW})
      `;
      await setComponentGrant(sql, {
        componentVersionId: "compv_1",
        workspaceId: "ws_1",
        channelId: null,
        agentProfileId: "cw_1",
        grantedBy: "user_1",
      });
      const logicalSessionId = stableChannelAgentSessionId("ch_crash_recovery", "cw_1");
      await sql`
        INSERT INTO channel_agent_sessions (
          id, workspace_id, channel_id, agent_profile_id, logical_agui_thread_id,
          current_generation_id, last_delivered_channel_sequence, state, created_at, updated_at
        ) VALUES (
          ${logicalSessionId}, 'ws_1', 'ch_crash_recovery', 'cw_1', 'thread_crash_recovery',
          NULL, 0, 'rotating', ${NOW}, ${NOW}
        )
      `;
      const store = createPostgresWorkspaceStore(sql);
      const coworker = await store.getCoworker("cw_1");
      expect(coworker).toBeTruthy();
      let listed = 0;
      let registeredConnectorName: string | null = null;
      const fetchImpl = vi.fn(async (request: string | URL, init?: RequestInit) => {
        const url = String(request);
        if (init?.method === "PUT" && url.endsWith("/api/v1/settings/mcp-servers")) {
          const body = JSON.parse(String(init.body)) as { manifest: { name: string; url: string } };
          registeredConnectorName = body.manifest.name;
          return new Response(
            JSON.stringify({
              data: {
                name: body.manifest.name,
                manifest: {
                  type: "remote",
                  name: body.manifest.name,
                  url: body.manifest.url,
                  description: "components",
                  auth: { type: "header", headers: { "x-forgeroom-mcp-token": "***" } },
                },
                auth_status: { status: "authenticated" },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (init?.method === "GET" && url.includes("/api/v1/sessions?")) {
          listed += 1;
          return new Response(JSON.stringify({ data: [], pagination: { next_page_token: null } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (init?.method === "POST" && url.endsWith("/api/v1/sessions")) {
          return new Response(
            JSON.stringify({
              data: {
                id: "tf_recovered_initial",
                agent: {},
                title: null,
                created_by: "local",
                created_at: NOW,
                updated_at: NOW,
              },
            }),
            { status: 201, headers: { "Content-Type": "application/json" } },
          );
        }
        if (init?.method === "GET" && url.endsWith("/api/v1/sessions/tf_recovered_initial")) {
          return new Response(
            JSON.stringify({
              data: {
                id: "tf_recovered_initial",
                agent: {},
                title: null,
                created_by: "local",
                created_at: NOW,
                updated_at: NOW,
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        throw new Error(`unexpected TrueForge request: ${init?.method ?? "GET"} ${url}`);
      });
      const client = new TrueForgeClient({
        baseUrl: "http://trueforge.test",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      const env = loadApiEnv({
        NODE_ENV: "test",
        APP_ORIGIN: "http://localhost:5173",
        OWNER_EMAIL: "owner@example.test",
        OWNER_PASSWORD: "correct-horse-battery",
        OWNER_USER_ID: "user_1",
        OWNER_DISPLAY_NAME: "Owner",
        WORKSPACE_ID: "ws_1",
        AUTH_STORE: "postgres",
        UI_COMPONENTS_MCP_SECRET: "test-ui-components-mcp-secret-that-is-long-enough",
      });

      const recovered = await ensureCoworkerChannelSession({
        store,
        workspaceId: "ws_1",
        channelId: "ch_crash_recovery",
        coworker: coworker!,
        createdBy: "user_1",
        client,
        sql,
        apiEnv: env,
      });

      expect(listed).toBe(1);
      expect(recovered.generationId).toBe(initialSessionGenerationId(logicalSessionId));
      expect(registeredConnectorName).toBe(`ui_components_v1__${recovered.generationId}`);
      expect(recovered.trueforgeSessionId).toBe("tf_recovered_initial");
    });
  }, 60_000);
});
