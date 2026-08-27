import { describe, expect, it } from "vitest";
import {
  decideSkillAttach,
  intersectEffectiveComponentTools,
  intersectEffectiveTools,
  intersectPinnedSkills,
  isCapabilityRestriction,
  recheckComponentToolCall,
} from "./capability-intersection";
import {
  atomicGenerationSwapContract,
  decideQueueItemRebind,
  planSessionRotation,
  reconcileMcpDuringRotation,
} from "./session-rotation";

describe("intersectEffectiveTools", () => {
  it("returns zero external tools when any grant layer is empty (SEC-001)", () => {
    const result = intersectEffectiveTools({
      workspacePolicyTools: ["GITHUB_GET_AN_ISSUE"],
      channelGrantTools: [],
      coworkerGrantTools: ["GITHUB_GET_AN_ISSUE"],
      connectors: [
        {
          connectorName: "composio_github",
          connectorAllowedTools: ["GITHUB_GET_AN_ISSUE"],
          accountActive: true,
          agentSpecEnabledTools: ["GITHUB_GET_AN_ISSUE"],
        },
      ],
    });
    expect(result.tools).toEqual([]);
  });

  it("intersects policy/grant/account/AgentSpec for grant-add", () => {
    const result = intersectEffectiveTools({
      workspacePolicyTools: ["GITHUB_GET_AN_ISSUE", "GITHUB_ADD_LABELS_TO_AN_ISSUE", "OTHER"],
      channelGrantTools: ["GITHUB_GET_AN_ISSUE", "GITHUB_ADD_LABELS_TO_AN_ISSUE"],
      coworkerGrantTools: ["GITHUB_GET_AN_ISSUE", "GITHUB_ADD_LABELS_TO_AN_ISSUE"],
      connectors: [
        {
          connectorName: "composio_github",
          connectorAllowedTools: ["GITHUB_GET_AN_ISSUE", "GITHUB_ADD_LABELS_TO_AN_ISSUE"],
          accountActive: true,
          agentSpecEnabledTools: ["GITHUB_GET_AN_ISSUE"],
          approvalRequiredTools: ["GITHUB_ADD_LABELS_TO_AN_ISSUE"],
        },
      ],
    });
    expect(result.tools).toEqual(["GITHUB_GET_AN_ISSUE"]);
    expect(result.connectors[0]?.enabledTools).toEqual(["GITHUB_GET_AN_ISSUE"]);
    expect(result.connectors[0]?.approvalRequiredTools).toEqual([]);
  });

  it("drops all connector tools when the pinned account is revoked", () => {
    const result = intersectEffectiveTools({
      workspacePolicyTools: ["GITHUB_GET_AN_ISSUE"],
      channelGrantTools: ["GITHUB_GET_AN_ISSUE"],
      coworkerGrantTools: ["GITHUB_GET_AN_ISSUE"],
      connectors: [
        {
          connectorName: "composio_github",
          connectorAllowedTools: ["GITHUB_GET_AN_ISSUE"],
          accountActive: false,
          agentSpecEnabledTools: ["GITHUB_GET_AN_ISSUE"],
        },
      ],
    });
    expect(result.tools).toEqual([]);
    expect(result.connectors[0]?.enabledTools).toEqual([]);
  });

  it("tightens policy by removing tools from the intersection", () => {
    const before = ["GITHUB_GET_AN_ISSUE", "GITHUB_ADD_LABELS_TO_AN_ISSUE"];
    const after = intersectEffectiveTools({
      workspacePolicyTools: ["GITHUB_GET_AN_ISSUE"],
      channelGrantTools: ["GITHUB_GET_AN_ISSUE", "GITHUB_ADD_LABELS_TO_AN_ISSUE"],
      coworkerGrantTools: ["GITHUB_GET_AN_ISSUE", "GITHUB_ADD_LABELS_TO_AN_ISSUE"],
      connectors: [
        {
          connectorName: "composio_github",
          connectorAllowedTools: ["GITHUB_GET_AN_ISSUE", "GITHUB_ADD_LABELS_TO_AN_ISSUE"],
          accountActive: true,
          agentSpecEnabledTools: ["GITHUB_GET_AN_ISSUE", "GITHUB_ADD_LABELS_TO_AN_ISSUE"],
        },
      ],
    });
    expect(after.tools).toEqual(["GITHUB_GET_AN_ISSUE"]);
    expect(isCapabilityRestriction(before, after.tools)).toBe(true);
  });
});

describe("component tools and call-time recheck", () => {
  it("offers only published granted agent_tool components", () => {
    const tools = intersectEffectiveComponentTools([
      {
        stableName: "metric",
        toolName: "ui.metric",
        published: true,
        activeGrant: true,
        exposure: "agent_tool",
        actualDescriptorHash: "sha256:a",
      },
      {
        stableName: "hitl",
        toolName: "ui.hitl",
        published: true,
        activeGrant: true,
        exposure: "server_only",
        actualDescriptorHash: "sha256:b",
      },
      {
        stableName: "chart",
        toolName: "ui.chart",
        published: true,
        activeGrant: false,
        exposure: "agent_tool",
        actualDescriptorHash: "sha256:c",
      },
    ]);
    expect(tools.map((row) => row.toolName)).toEqual(["ui.metric"]);
  });

  it("fails stale descriptor calls even when previously offered", () => {
    expect(
      recheckComponentToolCall({
        offeredInCurrentRevision: true,
        candidate: {
          stableName: "metric",
          toolName: "ui.metric",
          published: true,
          activeGrant: true,
          exposure: "agent_tool",
          expectedDescriptorHash: "sha256:old",
          actualDescriptorHash: "sha256:new",
        },
      }),
    ).toEqual({ ok: false, reason: "stale_or_ungranted" });
  });
});

describe("skill attach authority", () => {
  it("rejects skills that would expand tool authority", () => {
    expect(
      decideSkillAttach({
        skill: {
          skillName: "label-helper",
          requiredTools: ["GITHUB_ADD_LABELS_TO_AN_ISSUE"],
        },
        effectiveTools: ["GITHUB_GET_AN_ISSUE"],
        effectiveComponentTools: [],
      }),
    ).toMatchObject({ ok: false, reason: "missing_capability" });
  });

  it("keeps only skills inside the current intersection and rotates on attach", () => {
    const pinned = intersectPinnedSkills({
      pinnedSkillNames: ["ok-skill", "need-write"],
      manifests: [
        { skillName: "ok-skill", requiredTools: ["GITHUB_GET_AN_ISSUE"] },
        { skillName: "need-write", requiredTools: ["GITHUB_ADD_LABELS_TO_AN_ISSUE"] },
      ],
      effectiveTools: ["GITHUB_GET_AN_ISSUE"],
      effectiveComponentTools: [],
    });
    expect(pinned).toEqual(["ok-skill"]);
    expect(
      decideSkillAttach({
        skill: { skillName: "ok-skill", requiredTools: ["GITHUB_GET_AN_ISSUE"] },
        effectiveTools: ["GITHUB_GET_AN_ISSUE"],
        effectiveComponentTools: [],
      }),
    ).toEqual({ ok: true, skillName: "ok-skill", rotatesSessions: true });
  });
});

describe("session rotation plan", () => {
  it("blocks claims, cancels, and stales on grant-remove restriction", () => {
    const plan = planSessionRotation({
      reason: "grant_remove",
      previousTools: ["GITHUB_GET_AN_ISSUE", "GITHUB_ADD_LABELS_TO_AN_ISSUE"],
      nextTools: ["GITHUB_GET_AN_ISSUE"],
      hasActiveTurn: true,
      mcpInFlightKnownTerminal: false,
    });
    expect(plan.blockClaims).toBe(true);
    expect(plan.requestActiveTurnCancellation).toBe(true);
    expect(plan.staleUnresolvedActions).toBe(true);
    expect(plan.migrateResponseIntents).toBe(false);
    expect(plan.oldGenerationAcceptsNewWork).toBe(false);
    expect(plan.mcpInFlight).toEqual({
      kind: "unknown",
      honest: true,
      needsAttention: true,
    });
  });

  it("grant-add without tool loss does not cancel the active turn", () => {
    const plan = planSessionRotation({
      reason: "grant_add",
      previousTools: ["GITHUB_GET_AN_ISSUE"],
      nextTools: ["GITHUB_GET_AN_ISSUE", "GITHUB_ADD_LABELS_TO_AN_ISSUE"],
      hasActiveTurn: true,
      mcpInFlightKnownTerminal: null,
    });
    expect(plan.isRestriction).toBe(false);
    expect(plan.requestActiveTurnCancellation).toBe(false);
    expect(plan.staleUnresolvedActions).toBe(false);
    expect(plan.createNewTrueForgeSession).toBe(true);
  });

  it("never migrates response intents; normals may rebind", () => {
    expect(decideQueueItemRebind("normal")).toEqual({
      action: "rebind_to_current",
      inputType: "normal",
    });
    expect(decideQueueItemRebind("pause_group_response")).toEqual({
      action: "never_migrate",
      inputType: "pause_group_response",
      reason: "response_intent",
    });
    expect(decideQueueItemRebind("component_interaction_response").action).toBe("never_migrate");
  });

  it("reconciles in-flight MCP without denying by claim", () => {
    expect(reconcileMcpDuringRotation(true)).toEqual({
      outcome: { kind: "completed", honest: true },
      denyByClaim: false,
    });
  });

  it("swaps generation without overwriting old TrueForge IDs", () => {
    expect(atomicGenerationSwapContract()).toEqual({
      insertSessionRevision: true,
      insertGenerationHistoryRow: true,
      swapCurrentGenerationId: true,
      retireOldGeneration: true,
      overwriteOldTrueForgeIds: false,
    });
  });
});
