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
export type {
  AgentSpecPolicyExpectation,
  AgentSpecPolicyFinding,
} from "./agent-spec-verification";
export { TrueForgeClient, loadTrueForgeClientFromEnv } from "./client";
export {
  composioConnectorMcpRef,
  listMcpServerTools,
  mcpToolNames,
  registerHeaderAuthMcpServer,
} from "./mcp-connector";
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
