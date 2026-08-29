import { compileSessionRevision, provisionChannelCoworkerSession } from "./session";
import { TrueForgeClient } from "@forgeroom/trueforge";
import { describe, expect, it, vi } from "vitest";

describe("compileSessionRevision", () => {
  it("snapshots coworker config with P0 flags and hashes", () => {
    const revision = compileSessionRevision({
      coworker: {
        id: "cw_demo_operator",
        handle: "operator",
        name: "Operator",
        title: "Demo operator coworker",
        configRevision: 1,
        standingInstructions: "Help with Tasks.",
        modelPreset: "openai/gpt-5-4-mini",
        sandboxEnabled: true,
      },
      channelId: "ch_demo_general",
      workspaceId: "workspace_1",
      connectors: [
        {
          name: "github",
          enabledTools: ["GITHUB_GET_AN_ISSUE"],
          approvalRequiredTools: [],
        },
      ],
      createdBy: "user_owner",
    });

    expect(revision.agentProfileId).toBe("cw_demo_operator");
    expect(revision.sourceConfigRevision).toBe(1);
    expect(revision.effectiveConfigRedacted.compiled_flags).toEqual({
      dynamic_sub_agents: false,
      generative_ui: false,
      iframe_v1: false,
      coordinator_planning: false,
    });
    expect(revision.agentSpec.config.dynamic_sub_agents.enabled).toBe(false);
    expect(revision.effectiveSpecHash.startsWith("sha256:")).toBe(true);
    expect(revision.approvalPolicyHash.startsWith("sha256:")).toBe(true);
  });

  it("makes otherwise-identical provider specs unique per session generation", () => {
    const input = {
      coworker: {
        id: "cw_1",
        handle: "operator",
        name: "Operator",
        title: "Ops",
        configRevision: 1,
        modelPreset: "openai/gpt-5-4-mini",
        sandboxEnabled: false,
      },
      channelId: "ch_1",
      workspaceId: "ws_1",
      createdBy: "user_1",
    };
    const first = compileSessionRevision({
      ...input,
      providerSessionCorrelationId: "casg_1",
    });
    const second = compileSessionRevision({
      ...input,
      providerSessionCorrelationId: "casg_2",
    });

    expect(first.effectiveSpecHash).not.toBe(second.effectiveSpecHash);
    expect(first.agentSpec.instructions).toContain("session_generation=casg_1");
    expect(second.agentSpec.instructions).toContain("session_generation=casg_2");
  });

  it("offers controlled UI and application tools through one private generation connector", () => {
    const revision = compileSessionRevision({
      coworker: {
        id: "cw_1",
        handle: "operator",
        name: "Operator",
        title: "Ops",
        configRevision: 1,
        modelPreset: "openai/gpt-5-4-mini",
        sandboxEnabled: true,
      },
      channelId: "ch_1",
      workspaceId: "ws_1",
      componentToolNames: ["ui.dataTable"],
      applicationToolNames: ["records.task.upsert.v1"],
      uiComponentsMcpConnectorName: "ui_components_v1__casg_1",
      createdBy: "user_1",
    });

    expect(revision.agentSpec.mcp_servers).toEqual([
      expect.objectContaining({
        name: "ui_components_v1__casg_1",
        enable_tools: ["ui_dataTable", "records_task_upsert_v1"],
        preload_tools: ["ui_dataTable", "records_task_upsert_v1"],
        preload: false,
      }),
    ]);
    expect(revision.effectiveConfigRedacted.application_tool_names).toEqual([
      "records.task.upsert.v1",
    ]);
  });
});

describe("provisionChannelCoworkerSession", () => {
  it("creates and verifies a TrueForge session for each coworker", async () => {
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/v1/sessions") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            data: {
              id: "tf_sess_alpha",
              agent: { spec: { model: { name: "openai/gpt-5-4-mini" } } },
              title: null,
              created_by: "local",
              created_at: "2026-08-26T00:00:00.000Z",
              updated_at: "2026-08-26T00:00:00.000Z",
            },
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/api/v1/sessions/tf_sess_alpha")) {
        return new Response(
          JSON.stringify({
            data: {
              id: "tf_sess_alpha",
              agent: { spec: { model: { name: "openai/gpt-5-4-mini" } } },
              title: null,
              created_by: "local",
              created_at: "2026-08-26T00:00:00.000Z",
              updated_at: "2026-08-26T00:00:00.000Z",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    });

    const client = new TrueForgeClient({
      baseUrl: "http://127.0.0.1:8790",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const provisioned = await provisionChannelCoworkerSession(client, {
      channelAgentSessionId: "cas_1",
      generation: 1,
      agentVersionId: "av_1",
      coworker: {
        id: "cw_1",
        handle: "operator",
        name: "Operator",
        title: "Ops",
        configRevision: 1,
        modelPreset: "openai/gpt-5-4-mini",
        sandboxEnabled: false,
      },
      channelId: "ch_1",
      workspaceId: "ws_1",
      createdBy: "user_1",
    });

    expect(provisioned.trueforgeSession.id).toBe("tf_sess_alpha");
    expect(provisioned.generation.trueforgeSessionId).toBe("tf_sess_alpha");
    expect(provisioned.generation.state).toBe("ready");
    expect(provisioned.generation.effectiveSpecHash).toBe(provisioned.revision.effectiveSpecHash);

    const clientB = new TrueForgeClient({
      baseUrl: "http://127.0.0.1:8790",
      fetchImpl: (async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "POST") {
          return new Response(
            JSON.stringify({
              data: {
                id: "tf_sess_beta",
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
        if (url.includes("tf_sess_beta")) {
          return new Response(
            JSON.stringify({
              data: {
                id: "tf_sess_beta",
                agent: {},
                title: null,
                created_by: "local",
                created_at: "2026-08-26T00:00:00.000Z",
                updated_at: "2026-08-26T00:00:00.000Z",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("not found", { status: 404 });
      }) as unknown as typeof fetch,
    });

    const provisionedB = await provisionChannelCoworkerSession(clientB, {
      channelAgentSessionId: "cas_2",
      generation: 1,
      coworker: {
        id: "cw_2",
        handle: "research",
        name: "Research",
        title: "Reader",
        configRevision: 1,
        modelPreset: "openai/gpt-5-4-mini",
        sandboxEnabled: false,
      },
      channelId: "ch_1",
      workspaceId: "ws_1",
      createdBy: "user_1",
    });

    expect(provisionedB.trueforgeSession.id).toBe("tf_sess_beta");
    expect(provisionedB.trueforgeSession.id).not.toBe(provisioned.trueforgeSession.id);
  });

  it("reuses the provider session after a create response is lost", async () => {
    let capturedSpec: Record<string, unknown> | null = null;
    let postCalls = 0;
    const fetchImpl = vi.fn(async (request: string | URL, init?: RequestInit) => {
      const url = String(request);
      if (init?.method === "POST" && url.endsWith("/api/v1/sessions")) {
        postCalls += 1;
        const body = JSON.parse(String(init.body)) as {
          agent: { spec: Record<string, unknown> };
        };
        capturedSpec = body.agent.spec;
        throw new Error("simulated response loss after provider create");
      }
      const session = {
        id: "tf_sess_reconciled",
        agent: { type: "inline", spec: capturedSpec },
        title: null,
        created_by: "local",
        created_at: "2026-08-28T00:00:01.000Z",
        updated_at: "2026-08-28T00:00:01.000Z",
      };
      const unrelatedLaterSession = {
        ...session,
        id: "tf_sess_unrelated_later",
        created_at: "2026-08-28T00:10:00.000Z",
        updated_at: "2026-08-28T00:10:00.000Z",
      };
      if (init?.method === "GET" && url.includes("/api/v1/sessions?")) {
        return new Response(
          JSON.stringify({
            data: [session, unrelatedLaterSession],
            pagination: { next_page_token: null },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (init?.method === "GET" && url.endsWith("/api/v1/sessions/tf_sess_reconciled")) {
        return new Response(JSON.stringify({ data: session }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`unexpected TrueForge request: ${init?.method ?? "GET"} ${url}`);
    });
    const client = new TrueForgeClient({
      baseUrl: "http://trueforge.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const baseInput = {
      channelAgentSessionId: "cas_reconcile",
      generation: 2,
      generationId: "casg_reconcile",
      sourceConfigRevision: 2,
      coworker: {
        id: "cw_1",
        handle: "operator",
        name: "Operator",
        title: "Ops",
        configRevision: 1,
        modelPreset: "openai/gpt-5-4-mini",
        sandboxEnabled: false,
      },
      channelId: "ch_1",
      workspaceId: "ws_1",
      createdBy: "user_1",
    };

    await expect(
      provisionChannelCoworkerSession(client, {
        ...baseInput,
        providerReconciliation: {
          operationId: "audit_1:cas_reconcile",
          startedAt: "2026-08-28T00:00:00.000Z",
          reconcile: false,
        },
      }),
    ).rejects.toThrow("simulated response loss");

    const reconciled = await provisionChannelCoworkerSession(client, {
      ...baseInput,
      providerReconciliation: {
        operationId: "audit_1:cas_reconcile",
        startedAt: "2026-08-28T00:00:00.000Z",
        reconcile: true,
      },
    });

    expect(reconciled.trueforgeSession.id).toBe("tf_sess_reconciled");
    expect(postCalls).toBe(1);
  });
});
