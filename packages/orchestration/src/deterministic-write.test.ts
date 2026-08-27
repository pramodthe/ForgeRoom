import { describe, expect, it } from "vitest";
import { assertNoRawOrCredentials } from "./real-read";
import {
  dispatchApprovalGatedDeterministicWrite,
  projectSafeWriteToolEvents,
} from "./deterministic-write";

const baseSummary = {
  coworkerId: "cw_operator",
  toolName: "GITHUB_ADD_LABELS_TO_AN_ISSUE",
  connectorName: "composio_github",
  accountSuffix: "nizY",
  riskClass: "write" as const,
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
    labels: ["forgeroom-p0-probe"],
  },
  resultSummary: "Verified label add on GitHub issue pramodthe/ForgeRoom#35",
  receipt: {
    kind: "verified_provider_receipt",
    toolName: "GITHUB_ADD_LABELS_TO_AN_ISSUE",
    outcome: "succeeded",
    summary: "Verified label add on GitHub issue pramodthe/ForgeRoom#35",
  },
  receiptClaim: "verified_provider_receipt" as const,
  rawResultObserved: true,
  rawResultByteLength: 64,
};

const dispatchInput = {
  coworkerId: "cw_operator",
  channelId: "ch_demo",
  runId: "run_1",
  agentTurnId: "turn_1",
  pauseGroupId: "pg_1",
  proposalId: "ap_1",
};

function resumeIntent() {
  return {
    kind: "pause_resume" as const,
    pauseGroupId: "pg_1",
    proposalId: "ap_1",
    requiredActionId: "ra_1",
    decision: "allow" as const,
    oneIntent: true as const,
    automaticRetry: false as const,
  };
}

describe("P0-309 write event projection", () => {
  it("projects safe write events and only emits verified receipt when claimed", () => {
    const events = projectSafeWriteToolEvents({
      summary: baseSummary,
      outcome: "succeeded",
      toolCallId: "tc_write_1",
      channelId: "ch_demo",
      runId: "run_1",
      agentTurnId: "turn_1",
      proposalState: "reconciled_succeeded",
    });
    expect(events.map((event) => event.normalizedType)).toEqual([
      "tool.started",
      "tool.succeeded",
    ]);
    const succeeded = events[1]!.payloadRedacted;
    expect(succeeded.tool_name).toBe("GITHUB_ADD_LABELS_TO_AN_ISSUE");
    expect(succeeded.receipt).toEqual(baseSummary.receipt);
    expect(succeeded.receipt_claim).toBe("verified_provider_receipt");
    expect(succeeded.automatic_retry).toBe(false);
    expect(() => assertNoRawOrCredentials(succeeded)).not.toThrow();

    const unlabeled = projectSafeWriteToolEvents({
      summary: { ...baseSummary, receiptClaim: "none", receipt: null },
      outcome: "succeeded",
      toolCallId: "tc_write_1",
      channelId: "ch_demo",
      runId: "run_1",
      agentTurnId: "turn_1",
      proposalState: "reconciled_succeeded",
    });
    expect(unlabeled[1]!.payloadRedacted.receipt).toBeNull();
  });
});

describe("dispatchApprovalGatedDeterministicWrite", () => {
  it("denial produces zero provider calls and no resume intent", async () => {
    let writeInvoked = false;
    const result = await dispatchApprovalGatedDeterministicWrite(
      {
        assertApprovalRequired: () => undefined,
        preflight: () => ({
          ok: true,
          blocksDispatch: false,
          toolSlug: "GITHUB_ADD_LABELS_TO_AN_ISSUE",
          accountSuffix: "nizY",
          connectorName: "composio_github",
          descriptorHash: "hash",
          inApprovalRequiredSet: true,
        }),
        evaluateBindings: () => ({ fresh: true, requireNewProposal: false }),
        gateExecution: () => ({
          allowExecute: false,
          reason: "denied",
          providerCalls: 0,
          proposalState: "denied",
          createsResumeIntent: false,
        }),
        planResumeIntent: resumeIntent,
        invokeWriteViaTrueForge: async () => {
          writeInvoked = true;
          throw new Error("should not invoke");
        },
        assertDirectWriteTool: () => undefined,
        classifyProviderOutcome: () => ({
          proposalState: "succeeded",
          automaticRetry: false,
          timedOut: false,
        }),
        reconcileViaRead: async () => ({
          finalState: "reconciled_succeeded",
          matched: true,
          observedLabels: ["forgeroom-p0-probe"],
          verifiedReceipt: null,
        }),
        buildSafeSummary: () => baseSummary,
      },
      dispatchInput,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("denied");
    expect(result.providerCalls).toBe(0);
    expect(result.automaticRetry).toBe(false);
    expect(result.resumeIntent).toBeNull();
    expect(writeInvoked).toBe(false);
  });

  it("changed bindings require a new proposal and block execute", async () => {
    const result = await dispatchApprovalGatedDeterministicWrite(
      {
        assertApprovalRequired: () => undefined,
        preflight: () => ({
          ok: true,
          blocksDispatch: false,
          toolSlug: "GITHUB_ADD_LABELS_TO_AN_ISSUE",
          accountSuffix: "nizY",
          connectorName: "composio_github",
          descriptorHash: "hash",
          inApprovalRequiredSet: true,
        }),
        evaluateBindings: () => ({
          fresh: false,
          requireNewProposal: true,
          reason: "stale_proposal",
          changedFields: ["argumentsHash"],
        }),
        gateExecution: ({ bindingsFresh }) =>
          bindingsFresh
            ? {
                allowExecute: true,
                reason: "approved",
                providerCalls: 0,
                proposalState: "allowed",
                createsResumeIntent: true,
              }
            : {
                allowExecute: false,
                reason: "stale_proposal",
                providerCalls: 0,
                proposalState: "stale",
                createsResumeIntent: false,
              },
        planResumeIntent: resumeIntent,
        invokeWriteViaTrueForge: async () => {
          throw new Error("should not invoke");
        },
        assertDirectWriteTool: () => undefined,
        classifyProviderOutcome: () => ({
          proposalState: "succeeded",
          automaticRetry: false,
          timedOut: false,
        }),
        reconcileViaRead: async () => ({
          finalState: "reconciled_succeeded",
          matched: true,
          observedLabels: [],
          verifiedReceipt: null,
        }),
        buildSafeSummary: () => baseSummary,
      },
      dispatchInput,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("stale_proposal");
    expect(result.providerCalls).toBe(0);
  });

  it("approval creates one resume intent then reconciles without automatic retry", async () => {
    let writeInvoked = 0;
    let reconcileInvoked = 0;
    const result = await dispatchApprovalGatedDeterministicWrite(
      {
        assertApprovalRequired: () => undefined,
        preflight: () => ({
          ok: true,
          blocksDispatch: false,
          toolSlug: "GITHUB_ADD_LABELS_TO_AN_ISSUE",
          accountSuffix: "nizY",
          connectorName: "composio_github",
          descriptorHash: "hash",
          inApprovalRequiredSet: true,
        }),
        evaluateBindings: () => ({ fresh: true, requireNewProposal: false }),
        gateExecution: () => ({
          allowExecute: true,
          reason: "approved",
          providerCalls: 0,
          proposalState: "allowed",
          createsResumeIntent: true,
        }),
        planResumeIntent: resumeIntent,
        invokeWriteViaTrueForge: async () => {
          writeInvoked += 1;
          return {
            observedToolName: "GITHUB_ADD_LABELS_TO_AN_ISSUE",
            toolCallId: "tc_1",
            arguments: {
              owner: "pramodthe",
              repo: "ForgeRoom",
              issue_number: 35,
              labels: ["forgeroom-p0-probe"],
            },
            rawResult: { successful: true, data: { ok: true } },
            trueforgeTurnId: "tf_turn_1",
            trueforgeEventIds: ["evt_1"],
          };
        },
        assertDirectWriteTool: (name) => {
          expect(name).toBe("GITHUB_ADD_LABELS_TO_AN_ISSUE");
        },
        classifyProviderOutcome: () => ({
          proposalState: "unknown",
          automaticRetry: false,
          timedOut: true,
        }),
        reconcileViaRead: async () => {
          reconcileInvoked += 1;
          return {
            finalState: "reconciled_succeeded",
            matched: true,
            observedLabels: ["forgeroom-p0-probe"],
            verifiedReceipt: baseSummary.receipt,
          };
        },
        buildSafeSummary: () => baseSummary,
      },
      dispatchInput,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.kind).toBe("reconciled_succeeded");
    expect(result.resumeIntent.oneIntent).toBe(true);
    expect(result.providerCalls).toBe(1);
    expect(result.automaticRetry).toBe(false);
    expect(writeInvoked).toBe(1);
    expect(reconcileInvoked).toBe(1);
    expect(result.events[1]?.payloadRedacted.receipt_claim).toBe("verified_provider_receipt");
  });

  it("rejects meta-tool write observations", async () => {
    const result = await dispatchApprovalGatedDeterministicWrite(
      {
        assertApprovalRequired: () => undefined,
        preflight: () => ({
          ok: true,
          blocksDispatch: false,
          toolSlug: "GITHUB_ADD_LABELS_TO_AN_ISSUE",
          accountSuffix: "nizY",
          connectorName: "composio_github",
          descriptorHash: "hash",
          inApprovalRequiredSet: true,
        }),
        evaluateBindings: () => ({ fresh: true, requireNewProposal: false }),
        gateExecution: () => ({
          allowExecute: true,
          reason: "approved",
          providerCalls: 0,
          proposalState: "allowed",
          createsResumeIntent: true,
        }),
        planResumeIntent: resumeIntent,
        invokeWriteViaTrueForge: async () => ({
          observedToolName: "COMPOSIO_MULTI_EXECUTE_TOOL",
          toolCallId: "tc_1",
          arguments: {},
          rawResult: {},
          trueforgeTurnId: "tf_turn_1",
          trueforgeEventIds: [],
        }),
        assertDirectWriteTool: (name) => {
          throw new Error(`TrueForge invoked forbidden meta-tool ${name}`);
        },
        classifyProviderOutcome: () => ({
          proposalState: "succeeded",
          automaticRetry: false,
          timedOut: false,
        }),
        reconcileViaRead: async () => ({
          finalState: "reconciled_succeeded",
          matched: true,
          observedLabels: [],
          verifiedReceipt: null,
        }),
        buildSafeSummary: () => baseSummary,
      },
      dispatchInput,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("meta_tool_rejected");
    expect(result.providerCalls).toBe(0);
  });
});
