import { describe, expect, it } from "vitest";
import {
  assertNoRawOrCredentials,
  dispatchPersistentCoworkerRealRead,
  extractDirectToolObservationFromTrueForgeEvents,
  projectBlockedConnectionEvent,
  projectSafeReadToolEvents,
} from "./real-read";

const baseSummary = {
  coworkerId: "cw_operator",
  toolName: "GITHUB_GET_AN_ISSUE",
  connectorName: "composio_github",
  accountSuffix: "nizY",
  riskClass: "read" as const,
  target: {
    kind: "github_issue",
    owner: "pramodthe",
    repo: "ForgeRoom",
    issueNumber: 35,
    display: "pramodthe/ForgeRoom#35",
  },
  redactedArguments: {
    owner: "pramodthe",
    repo: "ForgeRoom",
    issue_number: 35,
  },
  resultSummary: "Verified read of GitHub issue pramodthe/ForgeRoom#35",
  receipt: {
    kind: "verified_provider_receipt",
    toolName: "GITHUB_GET_AN_ISSUE",
    outcome: "succeeded",
    summary: "Verified read of GitHub issue pramodthe/ForgeRoom#35",
  },
  rawResultObserved: true,
  rawResultByteLength: 128,
};

describe("P0-305 real read event projection", () => {
  it("projects coworker, tool, safe request and result summary", () => {
    const events = projectSafeReadToolEvents({
      summary: baseSummary,
      outcome: "succeeded",
      toolCallId: "tc_read_1",
      channelId: "ch_demo",
      runId: "run_1",
      agentTurnId: "turn_1",
    });
    expect(events.map((event) => event.normalizedType)).toEqual(["tool.started", "tool.succeeded"]);
    const succeeded = events[1]!.payloadRedacted;
    expect(succeeded.coworker_id).toBe("cw_operator");
    expect(succeeded.tool_name).toBe("GITHUB_GET_AN_ISSUE");
    expect(succeeded.redacted_arguments).toEqual(baseSummary.redactedArguments);
    expect(succeeded.result_summary).toMatch(/Verified read/);
    expect(succeeded).not.toHaveProperty("raw_result");
    expect(succeeded).not.toHaveProperty("data");
    expect(() => assertNoRawOrCredentials(succeeded)).not.toThrow();
  });

  it("rejects projected payloads that embed credentials or raw bodies", () => {
    expect(() =>
      assertNoRawOrCredentials({
        type: "tool.succeeded",
        raw_result: { body: "nope" },
      }),
    ).toThrow(/forbidden payload/);
    expect(() =>
      assertNoRawOrCredentials({
        type: "tool.succeeded",
        access_token: "secret",
      }),
    ).toThrow(/forbidden payload/);
  });

  it("projects blocked_connection without selecting a fallback account", () => {
    const event = projectBlockedConnectionEvent({
      coworkerId: "cw_operator",
      accountSuffix: "nizY",
      toolSlug: "GITHUB_GET_AN_ISSUE",
      reason: "expired_account",
      channelId: "ch_demo",
      runId: "run_1",
      agentTurnId: "turn_1",
    });
    expect(event.normalizedType).toBe("connection.blocked");
    expect(event.payloadRedacted.run_step_state).toBe("blocked_connection");
    expect(event.payloadRedacted.fallback_account_selected).toBe(false);
  });
});

describe("P0-305 dispatchPersistentCoworkerRealRead", () => {
  it("prefights expired accounts to blocked_connection before TrueForge", async () => {
    let invoked = false;
    const result = await dispatchPersistentCoworkerRealRead(
      {
        preflight: () => ({
          ok: false,
          blocksDispatch: true,
          reason: "expired_account",
          runStepState: "blocked_connection",
          accountSuffix: "nizY",
          toolSlug: "GITHUB_GET_AN_ISSUE",
        }),
        invokeViaTrueForge: async () => {
          invoked = true;
          throw new Error("should not invoke");
        },
        assertDirectTool: () => undefined,
        buildSafeSummary: () => baseSummary,
      },
      {
        coworkerId: "cw_operator",
        channelId: "ch_demo",
        runId: "run_1",
        agentTurnId: "turn_1",
      },
    );
    expect(invoked).toBe(false);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("blocked_connection");
    expect(result.runStepState).toBe("blocked_connection");
    expect(result.events[0]?.normalizedType).toBe("connection.blocked");
  });

  it("requires TrueForge to invoke the direct tool and emits safe events", async () => {
    const result = await dispatchPersistentCoworkerRealRead(
      {
        preflight: () => ({
          ok: true,
          blocksDispatch: false,
          toolSlug: "GITHUB_GET_AN_ISSUE",
          accountSuffix: "nizY",
          connectorName: "composio_github",
          descriptorHash: "hash",
        }),
        invokeViaTrueForge: async () => ({
          observedToolName: "GITHUB_GET_AN_ISSUE",
          toolCallId: "tc_1",
          arguments: {
            owner: "pramodthe",
            repo: "ForgeRoom",
            issue_number: 35,
          },
          rawResult: {
            successful: true,
            data: { title: "x", body: "RAW", access_token: "secret" },
          },
          trueforgeTurnId: "tf_turn_1",
          trueforgeEventIds: ["evt_1", "evt_2"],
        }),
        assertDirectTool: (name) => {
          if (name !== "GITHUB_GET_AN_ISSUE") {
            throw new Error(`meta-tool rejected: ${name}`);
          }
        },
        buildSafeSummary: () => baseSummary,
        isAuthFailure: () => false,
      },
      {
        coworkerId: "cw_operator",
        channelId: "ch_demo",
        runId: "run_1",
        agentTurnId: "turn_1",
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.observedToolName).toBe("GITHUB_GET_AN_ISSUE");
    expect(result.events).toHaveLength(2);
    const wire = JSON.stringify(result.events);
    expect(wire).toContain("cw_operator");
    expect(wire).toContain("GITHUB_GET_AN_ISSUE");
    expect(wire).toContain("result_summary");
    expect(wire).not.toContain("RAW");
    expect(wire).not.toContain("secret");
  });

  it("rejects meta-tool invocations from TrueForge", async () => {
    const result = await dispatchPersistentCoworkerRealRead(
      {
        preflight: () => ({
          ok: true,
          blocksDispatch: false,
          toolSlug: "GITHUB_GET_AN_ISSUE",
          accountSuffix: "nizY",
          connectorName: "composio_github",
          descriptorHash: "hash",
        }),
        invokeViaTrueForge: async () => ({
          observedToolName: "COMPOSIO_MULTI_EXECUTE_TOOL",
          toolCallId: "tc_bad",
          arguments: {},
          rawResult: {},
          trueforgeTurnId: "tf_turn_bad",
          trueforgeEventIds: [],
        }),
        assertDirectTool: (name) => {
          throw new Error(`TrueForge invoked forbidden meta-tool ${name}`);
        },
        buildSafeSummary: () => baseSummary,
      },
      {
        coworkerId: "cw_operator",
        channelId: "ch_demo",
        runId: "run_1",
        agentTurnId: "turn_1",
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("meta_tool_rejected");
  });

  it("maps mid-flight auth failure to blocked_connection", async () => {
    const result = await dispatchPersistentCoworkerRealRead(
      {
        preflight: () => ({
          ok: true,
          blocksDispatch: false,
          toolSlug: "GITHUB_GET_AN_ISSUE",
          accountSuffix: "nizY",
          connectorName: "composio_github",
          descriptorHash: "hash",
        }),
        invokeViaTrueForge: async () => ({
          observedToolName: "GITHUB_GET_AN_ISSUE",
          toolCallId: "tc_1",
          arguments: { owner: "pramodthe", repo: "ForgeRoom", issue_number: 35 },
          rawResult: { error: { message: "OAuth token expired" } },
          trueforgeTurnId: "tf_turn_1",
          trueforgeEventIds: ["evt_1"],
        }),
        assertDirectTool: () => undefined,
        buildSafeSummary: () => baseSummary,
        isAuthFailure: () => true,
      },
      {
        coworkerId: "cw_operator",
        channelId: "ch_demo",
        runId: "run_1",
        agentTurnId: "turn_1",
      },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("blocked_connection");
    expect(result.events[0]?.normalizedType).toBe("connection.blocked");
  });
});

describe("extractDirectToolObservationFromTrueForgeEvents", () => {
  it("reads direct tool call/result frames", () => {
    const observation = extractDirectToolObservationFromTrueForgeEvents({
      turn: { id: "turn_tf" },
      expectedToolName: "GITHUB_GET_AN_ISSUE",
      events: [
        {
          type: "tool.call",
          id: "evt_call",
          tool_name: "GITHUB_GET_AN_ISSUE",
          tool_call_id: "tc_1",
          arguments: { owner: "pramodthe", repo: "ForgeRoom", issue_number: 35 },
        },
        {
          type: "tool.result",
          id: "evt_result",
          tool_name: "GITHUB_GET_AN_ISSUE",
          tool_call_id: "tc_1",
          result: { successful: true, data: { title: "ok" } },
        },
      ],
    });
    expect(observation).toMatchObject({
      observedToolName: "GITHUB_GET_AN_ISSUE",
      toolCallId: "tc_1",
      trueforgeTurnId: "turn_tf",
    });
    expect(observation?.arguments.issue_number).toBe(35);
  });
});
