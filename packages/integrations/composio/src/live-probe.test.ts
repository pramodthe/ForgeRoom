import { describe, expect, it } from "vitest";
import { loadComposioSessionClientFromEnv } from "./client";
import {
  P0_COMPOSIO_APPROVAL_REQUIRED_TOOLS,
  P0_COMPOSIO_DESCRIPTOR_HASHES,
  P0_COMPOSIO_DIRECT_TOOLS,
  P0_COMPOSIO_ENABLED_TOOLS,
  P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME,
  assertP0ManifestHealthy,
  verifyP0Manifest,
} from "./index";

const hasLiveEnv =
  Boolean(process.env.COMPOSIO_API_KEY?.trim()) &&
  Boolean(process.env.COMPOSIO_USER_ID?.trim()) &&
  Boolean(process.env.COMPOSIO_CONNECTED_ACCOUNT_ID?.trim());

describe.runIf(hasLiveEnv)("Composio live hosted MCP probe", () => {
  it("creates a P0 direct-tools session with exact tools and no forbidden surfaces", async () => {
    const { P0_COMPOSIO_FORBIDDEN_SURFACES } = await import("./p0-contract");
    const client = loadComposioSessionClientFromEnv();
    const { session, evidence } = await client.probeDirectToolsSession();

    expect([...session.tools].sort()).toEqual([...P0_COMPOSIO_DIRECT_TOOLS].sort());
    for (const forbidden of P0_COMPOSIO_FORBIDDEN_SURFACES) {
      expect(session.tools).not.toContain(forbidden);
    }
    expect(evidence.forbiddenSurfacesPresent).toEqual([]);
    expect(evidence.connectedAccountSuffixes.github).toMatch(/^[A-Za-z0-9]{4}$/);
    expect(evidence.searchEnabled).toBe(false);
    expect(evidence.multiExecuteEnabled).toBe(false);
    expect(evidence.workbenchEnabled).toBe(false);
    expect(evidence.manageConnectionsEnabled).toBe(false);
    expect(evidence.multiAccountEnabled).toBe(false);
    expect(JSON.stringify(evidence)).not.toContain(process.env.COMPOSIO_API_KEY!);
    expect(JSON.stringify(evidence)).not.toContain(process.env.COMPOSIO_CONNECTED_ACCOUNT_ID!);
  }, 60_000);
});

describe.runIf(hasLiveEnv)("P0-302 live manifest preflight", () => {
  it("verifies descriptor hashes and ACTIVE pinned account", async () => {
    const client = loadComposioSessionClientFromEnv();
    const [descriptors, account] = await Promise.all([
      client.listP0ToolDescriptors(),
      client.getConnectedAccount(),
    ]);

    for (const row of descriptors) {
      expect(row.sha256).toBe(
        P0_COMPOSIO_DESCRIPTOR_HASHES[row.toolSlug as keyof typeof P0_COMPOSIO_DESCRIPTOR_HASHES],
      );
    }
    expect(account.status.toUpperCase()).toBe("ACTIVE");
    expect(account.isDisabled).toBe(false);

    const result = verifyP0Manifest({
      descriptors,
      account,
      compiledAllowlist: {
        connectorName: P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME,
        enabledTools: [...P0_COMPOSIO_ENABLED_TOOLS],
        approvalRequiredTools: [...P0_COMPOSIO_APPROVAL_REQUIRED_TOOLS],
      },
      connectorToolNames: [...P0_COMPOSIO_ENABLED_TOOLS],
    });
    assertP0ManifestHealthy(result);
    expect(result.redacted.healthy).toBe(true);
    expect(result.redacted.blocksDispatch).toBe(false);
    expect(JSON.stringify(result.redacted)).not.toContain(process.env.COMPOSIO_API_KEY!);
    expect(JSON.stringify(result.redacted)).not.toContain(
      process.env.COMPOSIO_CONNECTED_ACCOUNT_ID!,
    );
  }, 90_000);
});

describe.runIf(hasLiveEnv)("P0-305 live real read", () => {
  it("prefights exact account/tool then executes direct GITHUB_GET_AN_ISSUE safely", async () => {
    const {
      P0_COMPOSIO_READ_TOOL,
      buildSafeReadResultSummary,
      p0DemoReadArguments,
      preflightExactReadDispatch,
      toRedactedReadEvidence,
    } = await import("./real-read");

    const client = loadComposioSessionClientFromEnv();
    const account = await client.getConnectedAccount();
    const preflight = preflightExactReadDispatch({
      account,
      expectedConnectedAccountId: process.env.COMPOSIO_CONNECTED_ACCOUNT_ID!,
      toolSlug: P0_COMPOSIO_READ_TOOL,
      connectorToolNames: [...P0_COMPOSIO_ENABLED_TOOLS],
      observedDescriptorHash: P0_COMPOSIO_DESCRIPTOR_HASHES.GITHUB_GET_AN_ISSUE,
    });
    expect(preflight.ok).toBe(true);
    if (!preflight.ok) return;

    const executed = await client.executeDirectTool({
      toolSlug: P0_COMPOSIO_READ_TOOL,
      arguments: p0DemoReadArguments(),
    });
    expect(executed.toolSlug).toBe("GITHUB_GET_AN_ISSUE");
    expect(executed.authFailure).toBe(false);
    expect(executed.httpStatus).toBeLessThan(400);
    expect(executed.successful).not.toBe(false);

    const summary = buildSafeReadResultSummary({
      coworkerId: "cw_live_operator",
      accountSuffix: preflight.accountSuffix,
      arguments: p0DemoReadArguments(),
      rawResult: executed.raw,
    });
    const evidence = toRedactedReadEvidence(summary);
    expect(evidence.toolName).toBe("GITHUB_GET_AN_ISSUE");
    expect(evidence.targetDisplay).toBe("pramodthe/ForgeRoom#35");
    expect(evidence.rawResultBodyPresent).toBe(false);
    expect(JSON.stringify(evidence)).not.toContain(process.env.COMPOSIO_API_KEY!);
    expect(JSON.stringify(evidence)).not.toContain(process.env.COMPOSIO_CONNECTED_ACCOUNT_ID!);
    // Raw execute payload must not appear in the safe summary object.
    expect(JSON.stringify(summary)).not.toContain("COMPOSIO_API_KEY");
    if (typeof executed.raw === "object" && executed.raw && "data" in executed.raw) {
      const data = (executed.raw as { data?: { body?: unknown } }).data;
      if (data && typeof data.body === "string" && data.body.length > 20) {
        expect(JSON.stringify(summary)).not.toContain(data.body.slice(0, 40));
      }
    }
  }, 90_000);
});

const hasReconnectEnv = hasLiveEnv && Boolean(process.env.COMPOSIO_AUTH_CONFIG_ID?.trim());

describe.runIf(hasLiveEnv)("P0-304 live connections status/test", () => {
  it("returns active status with scopes/tools and performs a read-only test", async () => {
    const {
      P0_COMPOSIO_CONNECTION_ID,
      buildConnectionStatusView,
      evaluateConnectionTest,
      toRedactedConnectionEvidence,
      P0_COMPOSIO_READ_TOOL,
      p0DemoReadArguments,
    } = await import("./index");

    const client = loadComposioSessionClientFromEnv();
    const account = await client.getConnectedAccountDetails();
    if (!account) {
      throw new Error("Composio connected account response omitted account id");
    }
    expect(account.status.toUpperCase()).toBe("ACTIVE");
    expect(account.scopes.length).toBeGreaterThan(0);

    const view = buildConnectionStatusView({
      workspaceId: "workspace_1",
      connectionId: P0_COMPOSIO_CONNECTION_ID,
      account,
      expectedConnectedAccountId: process.env.COMPOSIO_CONNECTED_ACCOUNT_ID!,
      verifiedAt: new Date().toISOString(),
    });
    expect(view.status).toBe("active");
    expect(view.blocks_dispatch).toBe(false);
    expect(view.catalog_browse_allowed).toBe(false);
    expect(view.tools.length).toBe(P0_COMPOSIO_DIRECT_TOOLS.length);

    const executed = await client.executeDirectTool({
      toolSlug: P0_COMPOSIO_READ_TOOL,
      arguments: p0DemoReadArguments(),
    });
    const test = evaluateConnectionTest({
      connectionId: P0_COMPOSIO_CONNECTION_ID,
      expectedDescriptorHash: `sha256:${P0_COMPOSIO_DESCRIPTOR_HASHES.GITHUB_GET_AN_ISSUE}`,
      account,
      expectedConnectedAccountId: process.env.COMPOSIO_CONNECTED_ACCOUNT_ID!,
      execute: {
        httpStatus: executed.httpStatus,
        successful: executed.successful,
        authFailure: executed.authFailure,
      },
    });
    expect(test.ok).toBe(true);
    const evidence = toRedactedConnectionEvidence(view);
    expect(evidence.accountSuffix).toMatch(/^[A-Za-z0-9]{4}$/);
    expect(JSON.stringify(evidence)).not.toContain(process.env.COMPOSIO_API_KEY!);
    expect(JSON.stringify(evidence)).not.toContain(process.env.COMPOSIO_CONNECTED_ACCOUNT_ID!);
  }, 90_000);
});

describe.runIf(hasReconnectEnv)("P0-304 live Connect Link reconnect", () => {
  it("creates a short-lived Connect Link without adopting provisional account as pin", async () => {
    const { evaluatePinnedConnectionGate } = await import("./connections");
    const client = loadComposioSessionClientFromEnv();
    const link = await client.createConnectLink();
    expect(link.redirectUrl).toMatch(/^https:\/\//);
    expect(link.expiresAt).toBeTruthy();
    const pinned = await client.getConnectedAccountDetails();
    if (!pinned) {
      throw new Error("Composio connected account response omitted account id");
    }
    const gate = evaluatePinnedConnectionGate({
      account: pinned,
      expectedConnectedAccountId: process.env.COMPOSIO_CONNECTED_ACCOUNT_ID!,
      observedAlternateAccountId: link.provisionalConnectedAccountId,
    });
    // Live account remains the pin; provisional link account is never selected.
    if (
      link.provisionalConnectedAccountId &&
      link.provisionalConnectedAccountId !== process.env.COMPOSIO_CONNECTED_ACCOUNT_ID
    ) {
      expect(gate.fallbackAccountRejected).toBe(true);
    }
    expect(JSON.stringify(link)).not.toContain(process.env.COMPOSIO_API_KEY!);
  }, 60_000);
});

describe.runIf(hasLiveEnv)("P0-309 live approval-gated deterministic write", () => {
  it("denies without mutation, approves with one resume intent, reconciles, and never auto-retries timeout", async () => {
    const {
      P0_COMPOSIO_WRITE_TOOL,
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
    } = await import("./deterministic-write");
    const { extractLabelNamesFromIssueResult } = await import("./tool-policies");
    const { P0_COMPOSIO_DESCRIPTOR_HASHES, P0_COMPOSIO_ENABLED_TOOLS } = await import("./index");

    assertWriteToolInApprovalRequiredSet();

    const client = loadComposioSessionClientFromEnv();
    const account = await client.getConnectedAccount();
    const preflight = preflightExactWriteDispatch({
      account,
      expectedConnectedAccountId: process.env.COMPOSIO_CONNECTED_ACCOUNT_ID!,
      toolSlug: P0_COMPOSIO_WRITE_TOOL,
      connectorToolNames: [...P0_COMPOSIO_ENABLED_TOOLS],
      observedDescriptorHash: P0_COMPOSIO_DESCRIPTOR_HASHES.GITHUB_ADD_LABELS_TO_AN_ISSUE,
    });
    expect(preflight.ok).toBe(true);
    if (!preflight.ok) return;

    // Reset fixture to a known absent-label state.
    await client.executeDirectTool({
      toolSlug: "GITHUB_REMOVE_A_LABEL_FROM_AN_ISSUE",
      arguments: p0DemoWriteResetArguments(),
    });

    const beforeRead = await client.executeDirectTool({
      toolSlug: "GITHUB_GET_AN_ISSUE",
      arguments: p0DemoWriteReconcileArguments(),
    });
    const beforeLabels = extractLabelNamesFromIssueResult(beforeRead.raw) ?? [];
    expect(beforeLabels).not.toContain("forgeroom-p0-probe");

    // Denial leaves provider fixture unchanged (zero provider write calls).
    const denied = gateApprovalGatedWrite({
      proposalState: "denied",
      decision: "deny",
      bindingsFresh: true,
      preflightOk: true,
    });
    expect(denied.allowExecute).toBe(false);
    expect(denied.providerCalls).toBe(0);
    expect(denied.createsResumeIntent).toBe(false);

    const afterDenyRead = await client.executeDirectTool({
      toolSlug: "GITHUB_GET_AN_ISSUE",
      arguments: p0DemoWriteReconcileArguments(),
    });
    const afterDenyLabels = extractLabelNamesFromIssueResult(afterDenyRead.raw) ?? [];
    expect(afterDenyLabels).toEqual(beforeLabels);

    // Changed payload / binding requires a new proposal.
    const stale = evaluateWriteProposalFreshness({
      proposal: {
        toolName: P0_COMPOSIO_WRITE_TOOL,
        argumentsHash: "sha256:" + "aa".repeat(32),
        targetHash: "sha256:" + "aa".repeat(32),
        observedDescriptorHash: P0_COMPOSIO_DESCRIPTOR_HASHES.GITHUB_ADD_LABELS_TO_AN_ISSUE,
        accountId: process.env.COMPOSIO_CONNECTED_ACCOUNT_ID!,
        sessionGeneration: 1,
      },
      live: {
        toolName: P0_COMPOSIO_WRITE_TOOL,
        argumentsHash: "sha256:" + "bb".repeat(32),
        targetHash: "sha256:" + "aa".repeat(32),
        observedDescriptorHash: P0_COMPOSIO_DESCRIPTOR_HASHES.GITHUB_ADD_LABELS_TO_AN_ISSUE,
        accountId: process.env.COMPOSIO_CONNECTED_ACCOUNT_ID!,
        sessionGeneration: 1,
      },
    });
    expect(stale.requireNewProposal).toBe(true);

    // Timeout simulation: unknown, no automatic retry.
    const timedOut = classifyWriteProviderOutcome({ timedOut: true, successful: null });
    expect(timedOut.proposalState).toBe("unknown");
    expect(timedOut.automaticRetry).toBe(false);

    // Approval creates one resume intent, then execute + reconcile.
    const approved = gateApprovalGatedWrite({
      proposalState: "allowed",
      decision: "allow",
      bindingsFresh: true,
      preflightOk: true,
    });
    expect(approved.allowExecute).toBe(true);
    if (!approved.allowExecute) return;
    expect(approved.createsResumeIntent).toBe(true);
    const resumeIntent = planApplicationResumeIntent({
      pauseGroupId: "pg_live_write",
      proposalId: "ap_live_write",
      requiredActionId: "ra_live_write",
    });
    expect(resumeIntent.oneIntent).toBe(true);

    const executed = await client.executeDirectTool({
      toolSlug: P0_COMPOSIO_WRITE_TOOL,
      arguments: p0DemoWriteArguments(),
    });
    expect(executed.authFailure).toBe(false);
    expect(executed.httpStatus).toBeLessThan(400);

    const reconcileRead = await client.executeDirectTool({
      toolSlug: "GITHUB_GET_AN_ISSUE",
      arguments: p0DemoWriteReconcileArguments(),
    });
    const afterLabels = extractLabelNamesFromIssueResult(reconcileRead.raw) ?? [];
    expect(afterLabels).toContain("forgeroom-p0-probe");

    const reconciled = reconcileDeterministicWrite({
      proposal: {
        toolName: P0_COMPOSIO_WRITE_TOOL,
        redactedArguments: {
          owner: "pramodthe",
          repo: "ForgeRoom",
          issue_number: 35,
          labels: ["forgeroom-p0-probe"],
        },
        redactedTarget: {
          kind: "github_issue",
          owner: "pramodthe",
          repo: "ForgeRoom",
          issueNumber: 35,
          display: "pramodthe/ForgeRoom#35",
        },
        expectedEffect: "Add label(s) [forgeroom-p0-probe] to GitHub issue pramodthe/ForgeRoom#35",
      },
      reconciliationRawResult: reconcileRead.raw,
      writeRawResult: executed.raw,
      writeArguments: p0DemoWriteArguments(),
    });
    expect(reconciled.finalState).toBe("reconciled_succeeded");
    expect(reconciled.verifiedReceipt?.kind).toBe("verified_provider_receipt");

    const summary = buildSafeWriteResultSummary({
      coworkerId: "cw_live_operator",
      accountSuffix: preflight.accountSuffix,
      arguments: p0DemoWriteArguments(),
      rawResult: executed.raw,
    });
    const evidence = toRedactedWriteEvidence({
      summary,
      beforeLabels,
      afterLabels,
      denialProviderCalls: 0,
      approvalResumeIntents: 1,
      timeoutAutomaticRetry: false,
      reconciliationFinalState: reconciled.finalState,
    });
    expect(evidence.inApprovalRequiredSet).toBe(true);
    expect(evidence.denialProviderCalls).toBe(0);
    expect(evidence.approvalResumeIntents).toBe(1);
    expect(evidence.timeoutAutomaticRetry).toBe(false);
    expect(evidence.reconciliationFinalState).toBe("reconciled_succeeded");
    expect(evidence.rawResultBodyPresent).toBe(false);
    expect(JSON.stringify(evidence)).not.toContain(process.env.COMPOSIO_API_KEY!);
    expect(JSON.stringify(evidence)).not.toContain(process.env.COMPOSIO_CONNECTED_ACCOUNT_ID!);
  }, 180_000);
});
