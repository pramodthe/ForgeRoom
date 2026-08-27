import {
  compareAccountHealth,
  type ConnectedAccountHealth,
} from "./manifest-verification";
import {
  findForbiddenSurfaces,
  P0_COMPOSIO_DIRECT_TOOLS,
  P0_COMPOSIO_FORBIDDEN_SURFACES,
} from "./p0-contract";
import {
  P0_COMPOSIO_APPROVAL_REQUIRED_TOOLS,
  P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME,
} from "./policy";
import { redactConnectedAccountId } from "./redact";
import {
  assertWriteToolAllowed,
  demoAddProbeLabelArgs,
  demoGetIssueArgs,
  demoRemoveProbeLabelArgs,
  evaluateReconciliation,
  requireToolPolicy,
  type ActionProposalSlice,
  type RedactedArguments,
  type SafeTargetSummary,
  type VerifiedProviderReceipt,
} from "./tool-policies";
import { ToolPolicyError } from "./tool-policies/types";
import type { P0ComposioDirectToolSlug } from "./types";

/** Frozen P0 deterministic write tool (demo.md / OD-003). */
export const P0_COMPOSIO_WRITE_TOOL =
  "GITHUB_ADD_LABELS_TO_AN_ISSUE" as const satisfies P0ComposioDirectToolSlug;

/** Reviewed allowlisted reconciliation read for the demo write. */
export const P0_COMPOSIO_WRITE_RECONCILE_TOOL =
  "GITHUB_GET_AN_ISSUE" as const satisfies P0ComposioDirectToolSlug;

export type WritePreflightFailureReason =
  | "expired_account"
  | "disabled_account"
  | "account_inactive"
  | "account_mismatch"
  | "wrong_toolkit"
  | "unknown_tool"
  | "meta_tool_rejected"
  | "tool_not_on_connector"
  | "not_write_tool"
  | "not_approval_required"
  | "descriptor_hash_mismatch"
  | "unknown_write_blocked";

export type WriteDispatchPreflightInput = {
  account: ConnectedAccountHealth;
  expectedConnectedAccountId: string;
  toolSlug: string;
  connectorToolNames: readonly string[];
  observedDescriptorHash?: string;
  expectedToolkit?: string;
  /** Compiled TrueForge require_approval_for_tools set (literal). */
  approvalRequiredTools?: readonly string[];
};

export type WriteDispatchPreflightSuccess = {
  ok: true;
  blocksDispatch: false;
  toolSlug: typeof P0_COMPOSIO_WRITE_TOOL;
  accountSuffix: string;
  connectorName: typeof P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME;
  descriptorHash: string;
  inApprovalRequiredSet: true;
};

export type WriteDispatchPreflightFailure = {
  ok: false;
  blocksDispatch: true;
  reason: WritePreflightFailureReason;
  runStepState: "blocked_connection" | null;
  accountSuffix: string;
  toolSlug: string;
  findingKinds: string[];
};

export type WriteDispatchPreflightResult =
  | WriteDispatchPreflightSuccess
  | WriteDispatchPreflightFailure;

/** Exact bound fields that stale a proposal when changed (AP-006). */
export type WriteProposalBinding = {
  toolName: string;
  argumentsHash: string;
  targetHash: string;
  observedDescriptorHash: string;
  accountId: string;
  sessionGeneration: number;
};

export type WriteProposalFreshnessResult =
  | { fresh: true; requireNewProposal: false }
  | {
      fresh: false;
      requireNewProposal: true;
      reason: "stale_proposal";
      changedFields: Array<keyof WriteProposalBinding>;
    };

export type WriteExecutionDecision = "allow" | "deny" | null;

export type WriteExecutionGateResult =
  | {
      allowExecute: false;
      reason:
        | "denied"
        | "not_approved"
        | "stale_proposal"
        | "expired_proposal"
        | "forbidden_state"
        | "preflight_blocked";
      providerCalls: 0;
      proposalState:
        | "denied"
        | "proposed"
        | "stale"
        | "expired"
        | "allowed"
        | "executing"
        | "succeeded"
        | "failed"
        | "unknown"
        | "reconciled_succeeded"
        | "reconciled_failed";
      createsResumeIntent: false;
    }
  | {
      allowExecute: true;
      reason: "approved";
      providerCalls: 0;
      proposalState: "allowed";
      /** Exact approval creates exactly one application PauseResume intent (AP / security.md). */
      createsResumeIntent: true;
    };

export type WriteProviderOutcomeClassification = {
  proposalState: "succeeded" | "failed" | "unknown";
  automaticRetry: false;
  timedOut: boolean;
};

export type WriteReconciliationResult = {
  finalState: "reconciled_succeeded" | "reconciled_failed";
  matched: boolean;
  observedLabels: string[] | null;
  /** Only set when ToolPolicyDefinition.verifyReceipt returns a verified receipt. */
  verifiedReceipt: Extract<VerifiedProviderReceipt, { kind: "verified_provider_receipt" }> | null;
  labeledSafeResult: Extract<VerifiedProviderReceipt, { kind: "labeled_safe_result" }> | null;
};

export type SafeWriteResultSummary = {
  coworkerId: string;
  toolName: typeof P0_COMPOSIO_WRITE_TOOL;
  connectorName: typeof P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME;
  accountSuffix: string;
  riskClass: "write";
  target: SafeTargetSummary;
  redactedArguments: RedactedArguments;
  resultSummary: string;
  /** Named verified receipt only when adapter/policy verifies it. */
  receipt: VerifiedProviderReceipt | null;
  receiptClaim: "verified_provider_receipt" | "labeled_safe_result" | "none";
  rawResultObserved: boolean;
  rawResultByteLength: number | null;
};

export type ApplicationResumeIntentPlan = {
  kind: "pause_resume";
  pauseGroupId: string;
  proposalId: string;
  requiredActionId: string;
  decision: "allow";
  /** One PauseGroup → one application resume intent. */
  oneIntent: true;
  automaticRetry: false;
};

/**
 * AP-001: every external mutation must be literally listed in TrueForge approval rules.
 */
export function assertWriteToolInApprovalRequiredSet(
  toolSlug: string = P0_COMPOSIO_WRITE_TOOL,
  approvalRequiredTools: readonly string[] = P0_COMPOSIO_APPROVAL_REQUIRED_TOOLS,
): void {
  if (!(approvalRequiredTools as readonly string[]).includes(toolSlug)) {
    throw new ToolPolicyError(
      "unknown_write_blocked",
      `write tool ${toolSlug} is missing from TrueForge approval-required set`,
    );
  }
  assertWriteToolAllowed(toolSlug);
}

/**
 * Fail-closed preflight: exact pinned account + exact deterministic write tool,
 * and the tool must appear in the compiled approval-required set before any dispatch.
 */
export function preflightExactWriteDispatch(
  input: WriteDispatchPreflightInput,
): WriteDispatchPreflightResult {
  const accountSuffix = redactConnectedAccountId(input.expectedConnectedAccountId);
  const toolSlug = input.toolSlug.trim();
  const findingKinds: string[] = [];
  const approvalRequired =
    input.approvalRequiredTools ?? P0_COMPOSIO_APPROVAL_REQUIRED_TOOLS;

  if (input.account.id !== input.expectedConnectedAccountId) {
    findingKinds.push("account_mismatch");
    return failure("account_mismatch", toolSlug, accountSuffix, findingKinds, "blocked_connection");
  }

  const accountFindings = compareAccountHealth(
    input.account,
    input.expectedToolkit ?? "github",
  );
  for (const finding of accountFindings) {
    findingKinds.push(finding.kind);
  }
  if (accountFindings.some((row) => row.kind === "expired_account")) {
    return failure("expired_account", toolSlug, accountSuffix, findingKinds, "blocked_connection");
  }
  if (accountFindings.some((row) => row.kind === "disabled_account")) {
    return failure("disabled_account", toolSlug, accountSuffix, findingKinds, "blocked_connection");
  }
  if (accountFindings.some((row) => row.kind === "account_inactive")) {
    return failure("account_inactive", toolSlug, accountSuffix, findingKinds, "blocked_connection");
  }
  if (accountFindings.some((row) => row.kind === "wrong_toolkit")) {
    return failure("wrong_toolkit", toolSlug, accountSuffix, findingKinds, null);
  }

  if ((P0_COMPOSIO_FORBIDDEN_SURFACES as readonly string[]).includes(toolSlug)) {
    findingKinds.push("meta_tool_rejected");
    return failure("meta_tool_rejected", toolSlug, accountSuffix, findingKinds, null);
  }

  const connectorForbidden = findForbiddenSurfaces(input.connectorToolNames);
  if (connectorForbidden.length > 0) {
    findingKinds.push("meta_tool_rejected");
    return failure("meta_tool_rejected", toolSlug, accountSuffix, findingKinds, null);
  }

  if (!(P0_COMPOSIO_DIRECT_TOOLS as readonly string[]).includes(toolSlug)) {
    findingKinds.push("unknown_tool");
    return failure("unknown_tool", toolSlug, accountSuffix, findingKinds, null);
  }

  if (toolSlug !== P0_COMPOSIO_WRITE_TOOL) {
    findingKinds.push("not_write_tool");
    return failure("not_write_tool", toolSlug, accountSuffix, findingKinds, null);
  }

  if (!(approvalRequired as readonly string[]).includes(P0_COMPOSIO_WRITE_TOOL)) {
    findingKinds.push("not_approval_required");
    return failure("not_approval_required", toolSlug, accountSuffix, findingKinds, null);
  }

  if (!input.connectorToolNames.includes(P0_COMPOSIO_WRITE_TOOL)) {
    findingKinds.push("tool_not_on_connector");
    return failure("tool_not_on_connector", toolSlug, accountSuffix, findingKinds, null);
  }

  let policy;
  try {
    policy = assertWriteToolAllowed(P0_COMPOSIO_WRITE_TOOL);
  } catch {
    findingKinds.push("unknown_write_blocked");
    return failure("unknown_write_blocked", toolSlug, accountSuffix, findingKinds, null);
  }

  if (
    input.observedDescriptorHash &&
    input.observedDescriptorHash !== policy.observedDescriptorHash
  ) {
    findingKinds.push("descriptor_hash_mismatch");
    return failure("descriptor_hash_mismatch", toolSlug, accountSuffix, findingKinds, null);
  }

  return {
    ok: true,
    blocksDispatch: false,
    toolSlug: P0_COMPOSIO_WRITE_TOOL,
    accountSuffix,
    connectorName: P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME,
    descriptorHash: policy.observedDescriptorHash,
    inApprovalRequiredSet: true,
  };
}

function failure(
  reason: WritePreflightFailureReason,
  toolSlug: string,
  accountSuffix: string,
  findingKinds: string[],
  runStepState: "blocked_connection" | null,
): WriteDispatchPreflightFailure {
  return {
    ok: false,
    blocksDispatch: true,
    reason,
    runStepState,
    accountSuffix,
    toolSlug,
    findingKinds: [...new Set(findingKinds)].sort(),
  };
}

/**
 * AP-006: any bound-field change (target/args/descriptor/account/generation) requires a new proposal.
 */
export function evaluateWriteProposalFreshness(input: {
  proposal: WriteProposalBinding;
  live: WriteProposalBinding;
}): WriteProposalFreshnessResult {
  const changedFields: Array<keyof WriteProposalBinding> = [];
  const keys: Array<keyof WriteProposalBinding> = [
    "toolName",
    "argumentsHash",
    "targetHash",
    "observedDescriptorHash",
    "accountId",
    "sessionGeneration",
  ];
  for (const key of keys) {
    if (input.proposal[key] !== input.live[key]) {
      changedFields.push(key);
    }
  }
  if (changedFields.length > 0) {
    return {
      fresh: false,
      requireNewProposal: true,
      reason: "stale_proposal",
      changedFields,
    };
  }
  return { fresh: true, requireNewProposal: false };
}

/**
 * Exact approval gate: denial produces zero provider mutation (AP-008).
 * Approval plans exactly one application resume intent; write cannot start otherwise.
 */
export function gateApprovalGatedWrite(input: {
  proposalState: string;
  decision: WriteExecutionDecision;
  bindingsFresh: boolean;
  expired?: boolean;
  preflightOk?: boolean;
}): WriteExecutionGateResult {
  if (input.preflightOk === false) {
    return {
      allowExecute: false,
      reason: "preflight_blocked",
      providerCalls: 0,
      proposalState: input.proposalState as WriteExecutionGateResult["proposalState"],
      createsResumeIntent: false,
    };
  }

  if (input.expired || input.proposalState === "expired") {
    return {
      allowExecute: false,
      reason: "expired_proposal",
      providerCalls: 0,
      proposalState: "expired",
      createsResumeIntent: false,
    };
  }

  if (!input.bindingsFresh || input.proposalState === "stale") {
    return {
      allowExecute: false,
      reason: "stale_proposal",
      providerCalls: 0,
      proposalState: "stale",
      createsResumeIntent: false,
    };
  }

  if (input.decision === "deny" || input.proposalState === "denied") {
    return {
      allowExecute: false,
      reason: "denied",
      providerCalls: 0,
      proposalState: "denied",
      createsResumeIntent: false,
    };
  }

  if (input.decision === "allow" && input.proposalState === "allowed") {
    return {
      allowExecute: true,
      reason: "approved",
      providerCalls: 0,
      proposalState: "allowed",
      createsResumeIntent: true,
    };
  }

  if (input.proposalState === "proposed" || input.decision === null) {
    return {
      allowExecute: false,
      reason: "not_approved",
      providerCalls: 0,
      proposalState: "proposed",
      createsResumeIntent: false,
    };
  }

  return {
    allowExecute: false,
    reason: "forbidden_state",
    providerCalls: 0,
    proposalState: input.proposalState as WriteExecutionGateResult["proposalState"],
    createsResumeIntent: false,
  };
}

/**
 * Ambiguous / timed-out writes become `unknown` and must never auto-retry (SEC-015).
 */
export function classifyWriteProviderOutcome(input: {
  timedOut?: boolean;
  httpStatus?: number;
  successful: boolean | null;
  transportError?: boolean;
}): WriteProviderOutcomeClassification {
  if (input.timedOut === true || input.transportError === true) {
    return { proposalState: "unknown", automaticRetry: false, timedOut: true };
  }
  if (input.successful === true) {
    return { proposalState: "succeeded", automaticRetry: false, timedOut: false };
  }
  if (input.successful === false) {
    return { proposalState: "failed", automaticRetry: false, timedOut: false };
  }
  // Missing successful boolean or ambiguous HTTP → unknown, never blind retry.
  if (
    input.httpStatus !== undefined &&
    (input.httpStatus === 0 || input.httpStatus >= 500 || input.httpStatus === 408)
  ) {
    return { proposalState: "unknown", automaticRetry: false, timedOut: false };
  }
  return { proposalState: "unknown", automaticRetry: false, timedOut: false };
}

/**
 * One PauseGroup approval → one application resume intent (security.md external write semantics).
 */
export function planApplicationResumeIntent(input: {
  pauseGroupId: string;
  proposalId: string;
  requiredActionId: string;
}): ApplicationResumeIntentPlan {
  return {
    kind: "pause_resume",
    pauseGroupId: input.pauseGroupId,
    proposalId: input.proposalId,
    requiredActionId: input.requiredActionId,
    decision: "allow",
    oneIntent: true,
    automaticRetry: false,
  };
}

/**
 * Tool-specific read reconciliation establishes the final succeeded/failed state.
 * Never blind-retries the write.
 */
export function reconcileDeterministicWrite(input: {
  proposal: ActionProposalSlice;
  reconciliationRawResult: unknown;
  /** Optional write-tool raw result used only for receipt verification. */
  writeRawResult?: unknown;
  writeArguments?: unknown;
}): WriteReconciliationResult {
  const policy = assertWriteToolAllowed(input.proposal.toolName);
  if (!policy.reconcile) {
    throw new ToolPolicyError(
      "unknown_write_blocked",
      `write missing reconcile for ${input.proposal.toolName}`,
    );
  }
  const query = policy.reconcile(input.proposal);
  if (query.toolName !== P0_COMPOSIO_WRITE_RECONCILE_TOOL) {
    throw new ToolPolicyError(
      "unknown_write_blocked",
      `unexpected reconcile tool ${query.toolName}`,
    );
  }
  const evaluated = evaluateReconciliation(query, input.reconciliationRawResult);
  const finalState = evaluated.matched ? "reconciled_succeeded" : "reconciled_failed";

  let verifiedReceipt: WriteReconciliationResult["verifiedReceipt"] = null;
  let labeledSafeResult: WriteReconciliationResult["labeledSafeResult"] = null;
  if (input.writeRawResult !== undefined && input.writeArguments !== undefined) {
    const receipt = policy.verifyReceipt?.(input.writeRawResult, input.writeArguments) ?? null;
    if (receipt?.kind === "verified_provider_receipt") {
      verifiedReceipt = receipt;
    } else if (receipt?.kind === "labeled_safe_result") {
      labeledSafeResult = receipt;
    }
  }

  return {
    finalState,
    matched: evaluated.matched,
    observedLabels: evaluated.observedLabels,
    verifiedReceipt,
    labeledSafeResult,
  };
}

/**
 * Build the channel-safe attributed write result.
 * A result is called a verified receipt only when the policy adapter verifies it.
 */
export function buildSafeWriteResultSummary(input: {
  coworkerId: string;
  accountSuffix: string;
  arguments: unknown;
  rawResult: unknown;
}): SafeWriteResultSummary {
  if (!input.coworkerId.trim()) {
    throw new ToolPolicyError("invalid_arguments", "coworkerId is required for attributed write");
  }
  const policy = requireToolPolicy(P0_COMPOSIO_WRITE_TOOL);
  const target = policy.extractTarget(input.arguments);
  const redactedArguments = policy.redactArguments(input.arguments);
  const receipt = policy.verifyReceipt?.(input.rawResult, input.arguments) ?? null;
  const receiptClaim =
    receipt?.kind === "verified_provider_receipt"
      ? "verified_provider_receipt"
      : receipt?.kind === "labeled_safe_result"
        ? "labeled_safe_result"
        : "none";
  const resultSummary =
    receipt?.summary ??
    `Safe write summary for ${target.display}`;

  const rawSerialized =
    input.rawResult === undefined || input.rawResult === null
      ? null
      : typeof input.rawResult === "string"
        ? input.rawResult
        : JSON.stringify(input.rawResult);

  return {
    coworkerId: input.coworkerId,
    toolName: P0_COMPOSIO_WRITE_TOOL,
    connectorName: P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME,
    accountSuffix: input.accountSuffix,
    riskClass: "write",
    target,
    redactedArguments,
    resultSummary,
    receipt,
    receiptClaim,
    rawResultObserved: rawSerialized !== null,
    rawResultByteLength: rawSerialized === null ? null : Buffer.byteLength(rawSerialized, "utf8"),
  };
}

/** Canonical demo write / reset / reconcile arguments. */
export function p0DemoWriteArguments(): Record<string, unknown> {
  return demoAddProbeLabelArgs();
}

export function p0DemoWriteResetArguments(): Record<string, unknown> {
  return demoRemoveProbeLabelArgs();
}

export function p0DemoWriteReconcileArguments(): Record<string, unknown> {
  return demoGetIssueArgs();
}

export function assertTrueForgeInvokedDirectWriteTool(observedToolName: string): void {
  const name = observedToolName.trim();
  if ((P0_COMPOSIO_FORBIDDEN_SURFACES as readonly string[]).includes(name)) {
    throw new Error(
      `TrueForge invoked forbidden meta-tool ${name}; expected direct ${P0_COMPOSIO_WRITE_TOOL}`,
    );
  }
  if (name !== P0_COMPOSIO_WRITE_TOOL) {
    throw new Error(
      `TrueForge invoked ${name}; expected direct write tool ${P0_COMPOSIO_WRITE_TOOL}`,
    );
  }
}

/** Redacted evidence for checked-in fixtures (no secrets / raw bodies). */
export function toRedactedWriteEvidence(input: {
  summary?: SafeWriteResultSummary;
  beforeLabels: string[] | null;
  afterLabels: string[] | null;
  denialProviderCalls: number;
  approvalResumeIntents: number;
  timeoutAutomaticRetry: boolean;
  reconciliationFinalState: string | null;
}): Record<string, unknown> {
  return {
    ownerTask: "P0-309",
    toolName: P0_COMPOSIO_WRITE_TOOL,
    reconcileToolName: P0_COMPOSIO_WRITE_RECONCILE_TOOL,
    inApprovalRequiredSet: (P0_COMPOSIO_APPROVAL_REQUIRED_TOOLS as readonly string[]).includes(
      P0_COMPOSIO_WRITE_TOOL,
    ),
    targetDisplay: input.summary?.target.display ?? "pramodthe/ForgeRoom#35",
    beforeLabels: input.beforeLabels,
    afterLabels: input.afterLabels,
    denialProviderCalls: input.denialProviderCalls,
    approvalResumeIntents: input.approvalResumeIntents,
    timeoutAutomaticRetry: input.timeoutAutomaticRetry,
    reconciliationFinalState: input.reconciliationFinalState,
    receiptClaim: input.summary?.receiptClaim ?? null,
    rawResultBodyPresent: false,
    credentialsPresent: false,
  };
}
