import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  P0_COMPOSIO_APPROVAL_REQUIRED_TOOLS,
  P0_COMPOSIO_DESCRIPTOR_HASHES,
  P0_COMPOSIO_ENABLED_TOOLS,
  P0_COMPOSIO_FORBIDDEN_SURFACES,
  P0_COMPOSIO_WRITE_RECONCILE_TOOL,
  P0_COMPOSIO_WRITE_TOOL,
  assertTrueForgeInvokedDirectWriteTool,
  assertWriteToolInApprovalRequiredSet,
  buildSafeWriteResultSummary,
  classifyWriteProviderOutcome,
  evaluateWriteProposalFreshness,
  gateApprovalGatedWrite,
  p0DemoWriteArguments,
  p0DemoWriteReconcileArguments,
  p0DemoWriteResetArguments,
  planApplicationResumeIntent,
  preflightExactWriteDispatch,
  reconcileDeterministicWrite,
  toRedactedWriteEvidence,
} from "./index";

const ACTIVE_ACCOUNT = {
  id: "ca_test_account_nizY",
  status: "ACTIVE",
  isDisabled: false,
  toolkitSlug: "github",
};

const HASH_A = `sha256:${createHash("sha256").update("a").digest("hex")}`;
const HASH_B = `sha256:${createHash("sha256").update("b").digest("hex")}`;

const baseBinding = {
  toolName: P0_COMPOSIO_WRITE_TOOL,
  argumentsHash: HASH_A,
  targetHash: HASH_A,
  observedDescriptorHash: P0_COMPOSIO_DESCRIPTOR_HASHES.GITHUB_ADD_LABELS_TO_AN_ISSUE,
  accountId: ACTIVE_ACCOUNT.id,
  sessionGeneration: 1,
};

describe("P0-309 approval-required write set", () => {
  it("places the literal write tool in the TrueForge approval-required set", () => {
    expect(P0_COMPOSIO_APPROVAL_REQUIRED_TOOLS).toContain(P0_COMPOSIO_WRITE_TOOL);
    expect(() => assertWriteToolInApprovalRequiredSet()).not.toThrow();
    expect(() =>
      assertWriteToolInApprovalRequiredSet(P0_COMPOSIO_WRITE_TOOL, ["GITHUB_GET_AN_ISSUE"]),
    ).toThrow(/approval-required set/i);
  });
});

describe("P0-309 write preflight", () => {
  it("allows dispatch only for exact ACTIVE account and GITHUB_ADD_LABELS_TO_AN_ISSUE", () => {
    const result = preflightExactWriteDispatch({
      account: ACTIVE_ACCOUNT,
      expectedConnectedAccountId: ACTIVE_ACCOUNT.id,
      toolSlug: P0_COMPOSIO_WRITE_TOOL,
      connectorToolNames: [...P0_COMPOSIO_ENABLED_TOOLS],
      observedDescriptorHash: P0_COMPOSIO_DESCRIPTOR_HASHES.GITHUB_ADD_LABELS_TO_AN_ISSUE,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.toolSlug).toBe("GITHUB_ADD_LABELS_TO_AN_ISSUE");
    expect(result.inApprovalRequiredSet).toBe(true);
    expect(result.accountSuffix).toBe("nizY");
    expect(result.blocksDispatch).toBe(false);
  });

  it("rejects read tools, meta-tools, and missing approval rules", () => {
    const read = preflightExactWriteDispatch({
      account: ACTIVE_ACCOUNT,
      expectedConnectedAccountId: ACTIVE_ACCOUNT.id,
      toolSlug: "GITHUB_GET_AN_ISSUE",
      connectorToolNames: [...P0_COMPOSIO_ENABLED_TOOLS],
    });
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.reason).toBe("not_write_tool");

    const meta = preflightExactWriteDispatch({
      account: ACTIVE_ACCOUNT,
      expectedConnectedAccountId: ACTIVE_ACCOUNT.id,
      toolSlug: P0_COMPOSIO_FORBIDDEN_SURFACES[0]!,
      connectorToolNames: [...P0_COMPOSIO_ENABLED_TOOLS],
    });
    expect(meta.ok).toBe(false);
    if (!meta.ok) expect(meta.reason).toBe("meta_tool_rejected");

    const missingApproval = preflightExactWriteDispatch({
      account: ACTIVE_ACCOUNT,
      expectedConnectedAccountId: ACTIVE_ACCOUNT.id,
      toolSlug: P0_COMPOSIO_WRITE_TOOL,
      connectorToolNames: [...P0_COMPOSIO_ENABLED_TOOLS],
      approvalRequiredTools: [],
    });
    expect(missingApproval.ok).toBe(false);
    if (!missingApproval.ok) expect(missingApproval.reason).toBe("not_approval_required");
  });
});

describe("P0-309 binding freshness and denial gate", () => {
  it("requires a new proposal when target/args/descriptor/account/generation change", () => {
    const same = evaluateWriteProposalFreshness({
      proposal: baseBinding,
      live: { ...baseBinding },
    });
    expect(same).toEqual({ fresh: true, requireNewProposal: false });

    const argsChanged = evaluateWriteProposalFreshness({
      proposal: baseBinding,
      live: { ...baseBinding, argumentsHash: HASH_B },
    });
    expect(argsChanged.fresh).toBe(false);
    if (argsChanged.fresh) return;
    expect(argsChanged.requireNewProposal).toBe(true);
    expect(argsChanged.changedFields).toContain("argumentsHash");

    for (const field of [
      "targetHash",
      "observedDescriptorHash",
      "accountId",
      "sessionGeneration",
    ] as const) {
      const live = { ...baseBinding, [field]: field === "sessionGeneration" ? 2 : HASH_B };
      const result = evaluateWriteProposalFreshness({ proposal: baseBinding, live });
      expect(result.fresh).toBe(false);
      if (!result.fresh) {
        expect(result.changedFields).toContain(field);
      }
    }
  });

  it("denial leaves providerCalls at zero and does not create a resume intent", () => {
    const denied = gateApprovalGatedWrite({
      proposalState: "denied",
      decision: "deny",
      bindingsFresh: true,
    });
    expect(denied).toEqual({
      allowExecute: false,
      reason: "denied",
      providerCalls: 0,
      proposalState: "denied",
      createsResumeIntent: false,
    });

    const pending = gateApprovalGatedWrite({
      proposalState: "proposed",
      decision: null,
      bindingsFresh: true,
    });
    expect(pending.allowExecute).toBe(false);
    expect(pending.providerCalls).toBe(0);

    const approved = gateApprovalGatedWrite({
      proposalState: "allowed",
      decision: "allow",
      bindingsFresh: true,
    });
    expect(approved.allowExecute).toBe(true);
    if (!approved.allowExecute) return;
    expect(approved.createsResumeIntent).toBe(true);
    expect(approved.providerCalls).toBe(0);
  });

  it("plans exactly one application resume intent on approval", () => {
    const plan = planApplicationResumeIntent({
      pauseGroupId: "pg_1",
      proposalId: "ap_1",
      requiredActionId: "ra_1",
    });
    expect(plan).toEqual({
      kind: "pause_resume",
      pauseGroupId: "pg_1",
      proposalId: "ap_1",
      requiredActionId: "ra_1",
      decision: "allow",
      oneIntent: true,
      automaticRetry: false,
    });
  });
});

describe("P0-309 timeout and reconciliation", () => {
  it("classifies timeout as unknown with no automatic retry", () => {
    const timedOut = classifyWriteProviderOutcome({
      timedOut: true,
      successful: null,
    });
    expect(timedOut).toEqual({
      proposalState: "unknown",
      automaticRetry: false,
      timedOut: true,
    });

    const ambiguous = classifyWriteProviderOutcome({
      successful: null,
      httpStatus: 504,
    });
    expect(ambiguous.proposalState).toBe("unknown");
    expect(ambiguous.automaticRetry).toBe(false);
  });

  it("reconciles via allowlisted read into succeeded or failed final state", () => {
    const proposal = {
      toolName: P0_COMPOSIO_WRITE_TOOL,
      redactedArguments: {
        owner: "pramodthe",
        repo: "ForgeRoom",
        issue_number: 35,
        labels: ["forgeroom-p0-probe"],
      },
      redactedTarget: {
        kind: "github_issue" as const,
        owner: "pramodthe",
        repo: "ForgeRoom",
        issueNumber: 35,
        display: "pramodthe/ForgeRoom#35",
      },
      expectedEffect: "Add label(s) [forgeroom-p0-probe] to GitHub issue pramodthe/ForgeRoom#35",
    };

    const succeeded = reconcileDeterministicWrite({
      proposal,
      reconciliationRawResult: {
        successful: true,
        data: { labels: [{ name: "forgeroom-p0-probe" }] },
      },
      writeRawResult: { successful: true, data: { ok: true } },
      writeArguments: p0DemoWriteArguments(),
    });
    expect(succeeded.finalState).toBe("reconciled_succeeded");
    expect(succeeded.matched).toBe(true);
    expect(succeeded.verifiedReceipt?.kind).toBe("verified_provider_receipt");

    const failed = reconcileDeterministicWrite({
      proposal,
      reconciliationRawResult: {
        successful: true,
        data: { labels: [{ name: "bug" }] },
      },
    });
    expect(failed.finalState).toBe("reconciled_failed");
    expect(failed.matched).toBe(false);
  });

  it("calls a result verified receipt only when the adapter verifies it", () => {
    const verified = buildSafeWriteResultSummary({
      coworkerId: "cw_operator",
      accountSuffix: "nizY",
      arguments: p0DemoWriteArguments(),
      rawResult: { successful: true, data: { ok: true } },
    });
    expect(verified.receiptClaim).toBe("verified_provider_receipt");
    expect(verified.receipt?.kind).toBe("verified_provider_receipt");

    const unverified = buildSafeWriteResultSummary({
      coworkerId: "cw_operator",
      accountSuffix: "nizY",
      arguments: p0DemoWriteArguments(),
      rawResult: { data: { ok: true } },
    });
    expect(unverified.receiptClaim).toBe("none");
    expect(unverified.receipt).toBeNull();
    expect(unverified.resultSummary).toMatch(/Safe write summary/);
  });

  it("asserts TrueForge must invoke the direct write tool", () => {
    expect(() => assertTrueForgeInvokedDirectWriteTool(P0_COMPOSIO_WRITE_TOOL)).not.toThrow();
    expect(() => assertTrueForgeInvokedDirectWriteTool("COMPOSIO_MULTI_EXECUTE_TOOL")).toThrow(
      /meta-tool|direct/i,
    );
    expect(() => assertTrueForgeInvokedDirectWriteTool(P0_COMPOSIO_WRITE_RECONCILE_TOOL)).toThrow(
      /expected direct write/i,
    );
  });

  it("exposes demo write/reset/reconcile arguments for the synthetic fixture", () => {
    expect(p0DemoWriteArguments()).toMatchObject({
      owner: "pramodthe",
      repo: "ForgeRoom",
      issue_number: 35,
      labels: ["forgeroom-p0-probe"],
    });
    expect(p0DemoWriteResetArguments()).toMatchObject({
      name: "forgeroom-p0-probe",
    });
    expect(p0DemoWriteReconcileArguments()).toEqual({
      owner: "pramodthe",
      repo: "ForgeRoom",
      issue_number: 35,
    });
  });

  it("redacts write evidence without secrets or raw bodies", () => {
    const summary = buildSafeWriteResultSummary({
      coworkerId: "cw_operator",
      accountSuffix: "nizY",
      arguments: { ...p0DemoWriteArguments(), api_key: "secret" },
      rawResult: { successful: true, data: { access_token: "tok" } },
    });
    const evidence = toRedactedWriteEvidence({
      summary,
      beforeLabels: [],
      afterLabels: ["forgeroom-p0-probe"],
      denialProviderCalls: 0,
      approvalResumeIntents: 1,
      timeoutAutomaticRetry: false,
      reconciliationFinalState: "reconciled_succeeded",
    });
    expect(evidence.rawResultBodyPresent).toBe(false);
    expect(evidence.credentialsPresent).toBe(false);
    expect(JSON.stringify(evidence)).not.toContain("secret");
    expect(JSON.stringify(evidence)).not.toContain("tok");
  });
});
