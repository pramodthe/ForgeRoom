import { rotateChannelCoworkerSession } from "./session";
import { TrueForgeClient } from "@forgeroom/trueforge";
import { describe, expect, it, vi } from "vitest";

describe("rotateChannelCoworkerSession", () => {
  it("compiles intersected tools into a new SessionRevision and TrueForge session", async () => {
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/v1/sessions") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            data: {
              id: "tf_sess_rotated",
              agent: { spec: { model: { name: "openai/gpt-5-4-mini" } } },
              title: null,
              created_by: "local",
              created_at: "2026-08-27T00:00:00.000Z",
              updated_at: "2026-08-27T00:00:00.000Z",
            },
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/api/v1/sessions/tf_sess_rotated")) {
        return new Response(
          JSON.stringify({
            data: {
              id: "tf_sess_rotated",
              agent: { spec: { model: { name: "openai/gpt-5-4-mini" } } },
              title: null,
              created_by: "local",
              created_at: "2026-08-27T00:00:00.000Z",
              updated_at: "2026-08-27T00:00:00.000Z",
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

    const rotated = await rotateChannelCoworkerSession(client, {
      channelAgentSessionId: "cas_1",
      reason: "grant_remove",
      previousTools: ["GITHUB_GET_AN_ISSUE", "GITHUB_ADD_LABELS_TO_AN_ISSUE"],
      nextGeneration: 2,
      sourceConfigRevision: 2,
      hasActiveTurn: true,
      mcpInFlightKnownTerminal: false,
      capability: {
        workspacePolicyTools: ["GITHUB_GET_AN_ISSUE"],
        channelGrantTools: ["GITHUB_GET_AN_ISSUE"],
        coworkerGrantTools: ["GITHUB_GET_AN_ISSUE"],
        connectors: [
          {
            connectorName: "composio_github",
            connectorAllowedTools: ["GITHUB_GET_AN_ISSUE", "GITHUB_ADD_LABELS_TO_AN_ISSUE"],
            accountActive: true,
            agentSpecEnabledTools: ["GITHUB_GET_AN_ISSUE", "GITHUB_ADD_LABELS_TO_AN_ISSUE"],
          },
        ],
      },
      componentCandidates: [
        {
          stableName: "metric",
          toolName: "ui.metric",
          published: true,
          activeGrant: true,
          exposure: "agent_tool",
          actualDescriptorHash: "sha256:metric",
        },
      ],
      pinnedSkillNames: ["ok-skill", "need-write"],
      skillManifests: [
        { skillName: "ok-skill", requiredTools: ["GITHUB_GET_AN_ISSUE"] },
        { skillName: "need-write", requiredTools: ["GITHUB_ADD_LABELS_TO_AN_ISSUE"] },
      ],
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

    expect(rotated.trueforgeSessionId).toBe("tf_sess_rotated");
    expect(rotated.effectiveTools).toEqual(["GITHUB_GET_AN_ISSUE"]);
    expect(rotated.effectiveComponentTools).toEqual(["ui.metric"]);
    expect(rotated.pinnedSkills).toEqual(["ok-skill"]);
    expect(rotated.plan.requestActiveTurnCancellation).toBe(true);
    expect(rotated.revision.sourceConfigRevision).toBe(2);
    expect(rotated.generation.generation).toBe(2);
    expect(rotated.generation.trueforgeSessionId).toBe("tf_sess_rotated");
  });
});
