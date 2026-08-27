import { P0_COMPOSIO_DESCRIPTOR_HASHES } from "../descriptors";
import { P0_DEMO_GITHUB_ISSUE } from "./demo-fixture";
import {
  composioSuccessful,
  extractGithubIssueTarget,
  extractLabelNamesFromIssueResult,
  redactGithubIssueArguments,
} from "./args";
import type {
  ActionProposalSlice,
  ApprovalPreview,
  ReconciliationQuery,
  ToolPolicyDefinition,
  VerifiedProviderReceipt,
} from "./types";
import { ToolPolicyError } from "./types";

const GET_ALLOWLIST = ["owner", "repo", "issue_number"] as const;
const ADD_ALLOWLIST = ["owner", "repo", "issue_number", "labels"] as const;
const REMOVE_ALLOWLIST = ["owner", "repo", "issue_number", "name"] as const;

function dataLeavingWorkspace(targetDisplay: string): string {
  return `GitHub issue identity and requested fields for ${targetDisplay} leave the ForgeRoom workspace via the pinned Composio github account.`;
}

function previewBase(
  toolName: string,
  riskClass: ToolPolicyDefinition["riskClass"],
  args: unknown,
  allowlist: readonly string[],
  expectedEffect: (targetDisplay: string, redacted: Record<string, unknown>) => string,
): ApprovalPreview {
  const target = extractGithubIssueTarget(args);
  const redactedArguments = redactGithubIssueArguments(args, allowlist);
  return {
    toolName,
    riskClass,
    target,
    redactedArguments,
    expectedEffect: expectedEffect(target.display, redactedArguments as Record<string, unknown>),
    dataLeavingWorkspace: dataLeavingWorkspace(target.display),
  };
}

function labelsFromRedacted(redacted: Record<string, unknown>): string[] {
  const labels = redacted.labels;
  if (!Array.isArray(labels) || labels.length === 0) {
    throw new ToolPolicyError("invalid_arguments", "labels must be a non-empty array");
  }
  return labels.map(String);
}

function reconcileLabelExpectation(
  proposal: ActionProposalSlice,
  kind: "label_present" | "label_absent",
  labelField: "labels" | "name",
): ReconciliationQuery {
  const target = proposal.redactedTarget;
  let label: string;
  if (labelField === "name") {
    const name = proposal.redactedArguments.name;
    if (typeof name !== "string" || name.length === 0) {
      throw new ToolPolicyError("invalid_arguments", "reconcile requires redacted label name");
    }
    label = name;
  } else {
    const labels = labelsFromRedacted(proposal.redactedArguments as Record<string, unknown>);
    label = labels[0]!;
  }
  return {
    toolName: "GITHUB_GET_AN_ISSUE",
    arguments: {
      owner: target.owner,
      repo: target.repo,
      issue_number: target.issueNumber,
    },
    expect: { kind, label },
  };
}

function verifyComposioReceipt(
  toolName: string,
  result: unknown,
  args: unknown,
  successSummary: (targetDisplay: string) => string,
  failureSummary: (targetDisplay: string) => string,
): VerifiedProviderReceipt | null {
  const ok = composioSuccessful(result);
  if (ok === null) {
    return null;
  }
  const target = extractGithubIssueTarget(args);
  return {
    kind: "verified_provider_receipt",
    toolName,
    target,
    outcome: ok ? "succeeded" : "failed",
    summary: ok ? successSummary(target.display) : failureSummary(target.display),
  };
}

export const githubGetAnIssuePolicy: ToolPolicyDefinition = {
  toolName: "GITHUB_GET_AN_ISSUE",
  observedDescriptorHash: P0_COMPOSIO_DESCRIPTOR_HASHES.GITHUB_GET_AN_ISSUE,
  riskClass: "read",
  idempotency: "verified",
  extractTarget: extractGithubIssueTarget,
  redactArguments: (args) => redactGithubIssueArguments(args, GET_ALLOWLIST),
  renderPreview: (args) =>
    previewBase("GITHUB_GET_AN_ISSUE", "read", args, GET_ALLOWLIST, (display) =>
      `Read GitHub issue ${display}`,
    ),
  verifyReceipt: (result, args) => {
    const ok = composioSuccessful(result);
    if (ok === null) {
      // Labeled safe summary only when we can extract a target; never claim verified receipt.
      try {
        const target = extractGithubIssueTarget(args);
        return {
          kind: "labeled_safe_result",
          toolName: "GITHUB_GET_AN_ISSUE",
          target,
          summary: `Safe read summary for ${target.display}`,
          label: "safe_read_summary",
        };
      } catch {
        return null;
      }
    }
    return verifyComposioReceipt(
      "GITHUB_GET_AN_ISSUE",
      result,
      args,
      (display) => `Verified read of GitHub issue ${display}`,
      (display) => `Read of GitHub issue ${display} failed`,
    );
  },
};

export const githubAddLabelsToAnIssuePolicy: ToolPolicyDefinition = {
  toolName: "GITHUB_ADD_LABELS_TO_AN_ISSUE",
  observedDescriptorHash: P0_COMPOSIO_DESCRIPTOR_HASHES.GITHUB_ADD_LABELS_TO_AN_ISSUE,
  riskClass: "write",
  /**
   * GitHub add-labels is set-add: repeating the same labels is a no-op once present.
   * Trusted only for this reviewed tool — not a generic exactly-once claim.
   */
  idempotency: "verified",
  extractTarget: extractGithubIssueTarget,
  redactArguments: (args) => redactGithubIssueArguments(args, ADD_ALLOWLIST),
  renderPreview: (args) =>
    previewBase(
      "GITHUB_ADD_LABELS_TO_AN_ISSUE",
      "write",
      args,
      ADD_ALLOWLIST,
      (display, redacted) => {
        const labels = labelsFromRedacted(redacted).join(", ");
        return `Add label(s) [${labels}] to GitHub issue ${display}`;
      },
    ),
  reconcile: (proposal) => reconcileLabelExpectation(proposal, "label_present", "labels"),
  verifyReceipt: (result, args) =>
    verifyComposioReceipt(
      "GITHUB_ADD_LABELS_TO_AN_ISSUE",
      result,
      args,
      (display) => `Verified label add on GitHub issue ${display}`,
      (display) => `Label add on GitHub issue ${display} failed`,
    ),
};

export const githubRemoveLabelFromAnIssuePolicy: ToolPolicyDefinition = {
  toolName: "GITHUB_REMOVE_A_LABEL_FROM_AN_ISSUE",
  observedDescriptorHash: P0_COMPOSIO_DESCRIPTOR_HASHES.GITHUB_REMOVE_A_LABEL_FROM_AN_ISSUE,
  riskClass: "write",
  /** Set-remove semantics: removing an absent label does not create a second effect. */
  idempotency: "verified",
  extractTarget: extractGithubIssueTarget,
  redactArguments: (args) => redactGithubIssueArguments(args, REMOVE_ALLOWLIST),
  renderPreview: (args) =>
    previewBase(
      "GITHUB_REMOVE_A_LABEL_FROM_AN_ISSUE",
      "write",
      args,
      REMOVE_ALLOWLIST,
      (display, redacted) => {
        const name = String(redacted.name ?? "");
        return `Remove label [${name}] from GitHub issue ${display}`;
      },
    ),
  reconcile: (proposal) => reconcileLabelExpectation(proposal, "label_absent", "name"),
  verifyReceipt: (result, args) =>
    verifyComposioReceipt(
      "GITHUB_REMOVE_A_LABEL_FROM_AN_ISSUE",
      result,
      args,
      (display) => `Verified label remove on GitHub issue ${display}`,
      (display) => `Label remove on GitHub issue ${display} failed`,
    ),
};

/** Evaluate a reconciliation read result against the reviewed expectation. */
export function evaluateReconciliation(
  query: ReconciliationQuery,
  result: unknown,
): { matched: boolean; observedLabels: string[] | null } {
  const labels = extractLabelNamesFromIssueResult(result);
  if (labels === null) {
    return { matched: false, observedLabels: null };
  }
  const present = labels.includes(query.expect.label);
  const matched =
    query.expect.kind === "label_present" ? present : !present;
  return { matched, observedLabels: labels };
}

/** Canonical demo write args for golden tests and fixture reset. */
export function demoAddProbeLabelArgs(): Record<string, unknown> {
  return {
    owner: P0_DEMO_GITHUB_ISSUE.owner,
    repo: P0_DEMO_GITHUB_ISSUE.repo,
    issue_number: P0_DEMO_GITHUB_ISSUE.issueNumber,
    labels: [P0_DEMO_GITHUB_ISSUE.syntheticLabel],
  };
}

export function demoRemoveProbeLabelArgs(): Record<string, unknown> {
  return {
    owner: P0_DEMO_GITHUB_ISSUE.owner,
    repo: P0_DEMO_GITHUB_ISSUE.repo,
    issue_number: P0_DEMO_GITHUB_ISSUE.issueNumber,
    name: P0_DEMO_GITHUB_ISSUE.syntheticLabel,
  };
}

export function demoGetIssueArgs(): Record<string, unknown> {
  return {
    owner: P0_DEMO_GITHUB_ISSUE.owner,
    repo: P0_DEMO_GITHUB_ISSUE.repo,
    issue_number: P0_DEMO_GITHUB_ISSUE.issueNumber,
  };
}
