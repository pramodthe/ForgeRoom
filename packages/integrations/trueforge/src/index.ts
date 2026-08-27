export const TRUEFORGE_INTEGRATION = "p0-203" as const;

export function describeTrueForgeBoundary(): {
  harness: "trueforge";
  sdk: "p0-203";
  nativeSubagents: "disabled";
  iframe_v1: "disabled";
  credentials: "server-side-only";
  mcpRegistration: "header-auth";
} {
  return {
    harness: "trueforge",
    sdk: "p0-203",
    nativeSubagents: "disabled",
    iframe_v1: "disabled",
    credentials: "server-side-only",
    mcpRegistration: "header-auth",
  };
}

export { compileP0AgentSpec, hashAgentSpec, hashApprovalPolicy } from "./agent-spec";
export type { CompileP0AgentSpecInput } from "./agent-spec";
export {
  assertAgentSpecPolicyHealthy,
  verifyCompiledAgentSpecPolicy,
} from "./agent-spec-verification";
export type { AgentSpecPolicyExpectation, AgentSpecPolicyFinding } from "./agent-spec-verification";
export { TrueForgeClient, loadTrueForgeClientFromEnv } from "./client";
export {
  composioConnectorMcpRef,
  listMcpServerTools,
  mcpToolNames,
  registerHeaderAuthMcpServer,
} from "./mcp-connector";
export {
  assertSandboxEnabledToolPolicy,
  buildSandboxOnlyAgentSpecInstructions,
  DaytonaProbeClient,
  evaluateCredentialCanary,
  evaluateEgressProbe,
  extractToolCallsFromModelMessage,
  isSandboxCommandToolName,
  loadDaytonaProbeClientFromEnv,
  mapTrueForgeWireEventsToSandboxLifecycle,
  sha256Utf8,
  toRedactedSandboxEvidence,
  verifySandboxEnabledToolPolicy,
} from "./sandbox";
export type {
  CredentialCanaryProbeResult,
  DaytonaProbeClientOptions,
  EgressProbeResult,
  MappedSandboxLifecycleEvent,
  RedactedSandboxEvidence,
  SandboxApplicationEventType,
  SandboxCommandState,
  SandboxProfilePolicyResult,
} from "./sandbox";
export {
  P0_DAYTONA_API_BASE,
  P0_SANDBOX_CREDENTIAL_CANARY_ENV_KEYS,
  P0_SANDBOX_EGRESS_PROBE_URL,
  P0_SANDBOX_FIXTURE_DEMO_LINES,
  P0_SANDBOX_FIXTURE_DEMO_LINES_SHA256,
  P0_SANDBOX_FIXTURE_REMOTE_PATH,
  P0_SANDBOX_FORBIDDEN_SENSITIVE_READ_TOOLS,
  P0_TRUEFORGE_SANDBOX_CREATED_WIRE_TYPE,
  P0_TRUEFORGE_SANDBOX_FILE_WIRE_TYPE,
} from "./sandbox-p0-contract";
export type {
  RegisterHeaderAuthMcpServerInput,
  TrueForgeConfiguredMcpServer,
  TrueForgeMcpServerManifest,
  TrueForgeMcpTool,
} from "./mcp-connector";
export type {
  CreateSessionInput,
  CreateTurnInput,
  PreviousTurnIdInput,
  TrueForgeAgentSpec,
  TrueForgeClientOptions,
  TrueForgeMcpServerRef,
  TrueForgeModelRef,
  TrueForgeSession,
  TrueForgeSkillRef,
  TrueForgeTurn,
  TrueForgeTurnEvent,
  TrueForgeTurnState,
  TurnInputItem,
  UserMessageInput,
} from "./types";
