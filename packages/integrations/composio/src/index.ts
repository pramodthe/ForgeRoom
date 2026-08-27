export {
  P0_COMPOSIO_DIRECT_TOOLS,
  P0_COMPOSIO_FORBIDDEN_SURFACES,
  P0_COMPOSIO_MAX_TOOLS,
  P0_COMPOSIO_MAX_TOOLKITS,
  P0_COMPOSIO_MIN_TOOLS,
  P0_COMPOSIO_TOOLKIT,
  assertP0ToolCount,
  findForbiddenSurfaces,
} from "./p0-contract";
export { ComposioSessionClient, loadComposioSessionClientFromEnv } from "./client";
export {
  P0_COMPOSIO_DESCRIPTOR_HASHES,
  compareDescriptorHashes,
  expectedDescriptorHash,
  hashComposioToolDescriptorBody,
} from "./descriptors";
export type { DescriptorDriftFinding, ObservedToolDescriptor } from "./descriptors";
export {
  P0_COMPOSIO_APPROVAL_POLICY_HASH,
  P0_COMPOSIO_APPROVAL_REQUIRED_TOOLS,
  P0_COMPOSIO_APPROVAL_REQUIRED_TOOLS_HASH,
  P0_COMPOSIO_ENABLED_TOOLS,
  P0_COMPOSIO_ENABLED_TOOLS_HASH,
  P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME,
  compareCompiledAllowlist,
  hashPolicyValue,
} from "./policy";
export type { CoworkerCompiledAllowlist, PolicyDriftFinding } from "./policy";
export {
  assertP0ManifestHealthy,
  buildFrozenP0ManifestVerificationInput,
  compareAccountHealth,
  verifyP0Manifest,
  verifyP0ManifestForDispatch,
} from "./manifest-verification";
export type {
  AccountDriftFinding,
  ConnectedAccountHealth,
  ManifestVerificationFinding,
  ManifestVerificationInput,
  ManifestVerificationRedactedEvidence,
  ManifestVerificationResult,
} from "./manifest-verification";
export {
  P0_COMPOSIO_READ_TOOL,
  preflightExactReadDispatch,
  buildSafeReadResultSummary,
  assertTrueForgeInvokedDirectReadTool,
  isComposioAuthFailure,
  p0DemoReadArguments,
  toRedactedReadEvidence,
} from "./real-read";
export type {
  ReadDispatchPreflightInput,
  ReadDispatchPreflightResult,
  ReadDispatchPreflightSuccess,
  ReadDispatchPreflightFailure,
  ReadPreflightFailureReason,
  ComposioToolExecuteRequest,
  ComposioToolExecuteResult,
  SafeReadResultSummary,
} from "./real-read";
export {
  P0_COMPOSIO_WRITE_TOOL,
  P0_COMPOSIO_WRITE_RECONCILE_TOOL,
  assertWriteToolInApprovalRequiredSet,
  preflightExactWriteDispatch,
  evaluateWriteProposalFreshness,
  gateApprovalGatedWrite,
  classifyWriteProviderOutcome,
  planApplicationResumeIntent,
  reconcileDeterministicWrite,
  buildSafeWriteResultSummary,
  assertTrueForgeInvokedDirectWriteTool,
  p0DemoWriteArguments,
  p0DemoWriteResetArguments,
  p0DemoWriteReconcileArguments,
  toRedactedWriteEvidence,
} from "./deterministic-write";
export type {
  WriteDispatchPreflightInput,
  WriteDispatchPreflightResult,
  WriteDispatchPreflightSuccess,
  WriteDispatchPreflightFailure,
  WritePreflightFailureReason,
  WriteProposalBinding,
  WriteProposalFreshnessResult,
  WriteExecutionDecision,
  WriteExecutionGateResult,
  WriteProviderOutcomeClassification,
  WriteReconciliationResult,
  SafeWriteResultSummary,
  ApplicationResumeIntentPlan,
} from "./deterministic-write";
export { redactConnectedAccountId, redactMcpUrl, toRedactedSessionEvidence } from "./redact";
export type {
  ComposioClientOptions,
  ComposioHostedSession,
  ComposioMcpSecrets,
  ComposioSessionConfigSnapshot,
  ComposioSessionRedactedEvidence,
  ComposioToolkitSlug,
  ConnectedAccountsPin,
  P0ComposioDirectToolSlug,
} from "./types";
export {
  P0_DEMO_GITHUB_ISSUE,
  P0_TOOL_POLICIES,
  ToolPolicyError,
  assertToolPolicyCoverage,
  assertWriteToolAllowed,
  demoAddProbeLabelArgs,
  demoGetIssueArgs,
  demoRemoveProbeLabelArgs,
  describeToolPolicyBoundary,
  evaluateReconciliation,
  getToolPolicy,
  listToolPolicies,
  requireToolPolicy,
} from "./tool-policies";
export type {
  ActionProposalSlice,
  ApprovalPreview,
  ReconciliationQuery,
  RedactedArguments,
  SafeTargetSummary,
  ToolIdempotencyClass,
  ToolPolicyDefinition,
  ToolRiskClass,
  VerifiedProviderReceipt,
} from "./tool-policies";
export {
  P0_COMPOSIO_CONNECTION_ID,
  assertReconnectBoundToWorkspace,
  buildConnectionStatusView,
  buildP0ActingIdentity,
  evaluateConnectionTest,
  evaluatePinnedConnectionGate,
  listP0ConnectionTools,
  parseGrantedScopes,
  toRedactedConnectionEvidence,
} from "./connections";
export type {
  BuildConnectionStatusInput,
  ConnectLinkResponse,
  ConnectionActingIdentity,
  ConnectionDispatchGate,
  ConnectionStatusSnapshot,
  ConnectionStatusValue,
  ConnectionTestSnapshot,
  ConnectionToolkitHealth,
  ConnectionToolDescriptor,
  PinnedAccountObservation,
  ReconnectBinding,
  SafeConnectionTestInput,
} from "./connections";

export function describeComposioBoundary(): {
  provider: "composio";
  session: "direct-tools-hosted-mcp";
  catalogAccess: "literal-allowlist-only";
  trueforgeConnector: "composio_github";
  ownerTask: "P0-309";
  toolPolicies: "P0-303";
  realRead: "GITHUB_GET_AN_ISSUE";
  deterministicWrite: "GITHUB_ADD_LABELS_TO_AN_ISSUE";
  connections: "P0-304";
} {
  return {
    provider: "composio",
    session: "direct-tools-hosted-mcp",
    catalogAccess: "literal-allowlist-only",
    trueforgeConnector: "composio_github",
    ownerTask: "P0-309",
    toolPolicies: "P0-303",
    realRead: "GITHUB_GET_AN_ISSUE",
    deterministicWrite: "GITHUB_ADD_LABELS_TO_AN_ISSUE",
    connections: "P0-304",
  };
}
