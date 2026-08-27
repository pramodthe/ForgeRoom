export const TRUEFORGE_INTEGRATION = "p0-201" as const;

export function describeTrueForgeBoundary(): {
  harness: "trueforge";
  sdk: "p0-201";
  nativeSubagents: "disabled";
  iframe_v1: "disabled";
  credentials: "server-side-only";
} {
  return {
    harness: "trueforge",
    sdk: "p0-201",
    nativeSubagents: "disabled",
    iframe_v1: "disabled",
    credentials: "server-side-only",
  };
}

export { compileP0AgentSpec, hashAgentSpec, hashApprovalPolicy } from "./agent-spec";
export type { CompileP0AgentSpecInput } from "./agent-spec";
export { TrueForgeClient, loadTrueForgeClientFromEnv } from "./client";
export type {
  CreateSessionInput,
  TrueForgeAgentSpec,
  TrueForgeClientOptions,
  TrueForgeMcpServerRef,
  TrueForgeModelRef,
  TrueForgeSession,
  TrueForgeSkillRef,
} from "./types";
