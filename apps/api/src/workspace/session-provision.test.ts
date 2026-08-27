import { describe, expect, it, vi } from "vitest";
import { TrueForgeClient } from "@forgeroom/trueforge";
import { createMemoryWorkspaceStore } from "./store";
import { ensureCoworkerChannelSession } from "./session-provision";

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
});
