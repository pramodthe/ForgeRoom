/**
 * Application-owned ToolPolicyDefinition surface (runtime.md#toolpolicydefinition).
 * Server semantics only — never trust model-authored summaries for these fields.
 */

export type ToolRiskClass = "read" | "write" | "destructive" | "blocked";

/** Explicit classification — never assume provider idempotency. */
export type ToolIdempotencyClass = "verified" | "not-idempotent" | "unknown";

export type SafeTargetSummary = {
  kind: "github_issue";
  owner: string;
  repo: string;
  issueNumber: number;
  display: string;
};

export type RedactedArguments = Readonly<Record<string, unknown>>;

export type ApprovalPreview = {
  toolName: string;
  riskClass: ToolRiskClass;
  target: SafeTargetSummary;
  redactedArguments: RedactedArguments;
  expectedEffect: string;
  dataLeavingWorkspace: string;
};

/**
 * Minimal proposal slice consumed by reconcile(). Full ActionProposal persistence is P0-306+.
 */
export type ActionProposalSlice = {
  toolName: string;
  redactedArguments: RedactedArguments;
  redactedTarget: SafeTargetSummary;
  expectedEffect: string;
};

export type ReconciliationQuery = {
  toolName: "GITHUB_GET_AN_ISSUE";
  arguments: {
    owner: string;
    repo: string;
    issue_number: number;
  };
  expect: {
    kind: "label_present" | "label_absent";
    label: string;
  };
};

export type VerifiedProviderReceipt =
  | {
      kind: "verified_provider_receipt";
      toolName: string;
      target: SafeTargetSummary;
      outcome: "succeeded" | "failed";
      summary: string;
    }
  | {
      kind: "labeled_safe_result";
      toolName: string;
      target: SafeTargetSummary;
      summary: string;
      label: "safe_read_summary";
    };

export type ToolPolicyDefinition = {
  toolName: string;
  observedDescriptorHash: string;
  riskClass: ToolRiskClass;
  extractTarget: (args: unknown) => SafeTargetSummary;
  redactArguments: (args: unknown) => RedactedArguments;
  renderPreview: (args: unknown) => ApprovalPreview;
  idempotency: ToolIdempotencyClass;
  reconcile?: (proposal: ActionProposalSlice) => ReconciliationQuery;
  verifyReceipt?: (result: unknown, args: unknown) => VerifiedProviderReceipt | null;
};

export class ToolPolicyError extends Error {
  readonly code:
    | "invalid_arguments"
    | "unknown_tool"
    | "unknown_write_blocked"
    | "policy_coverage"
    | "descriptor_hash_mismatch";

  constructor(code: ToolPolicyError["code"], message: string) {
    super(message);
    this.name = "ToolPolicyError";
    this.code = code;
  }
}
