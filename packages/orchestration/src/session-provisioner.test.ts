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
});
