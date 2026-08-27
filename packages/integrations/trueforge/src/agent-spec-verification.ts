import { hashApprovalPolicy } from "./agent-spec";
import type { TrueForgeAgentSpec, TrueForgeMcpServerRef } from "./types";

export type AgentSpecPolicyExpectation = {
  connectorName: string;
  enabledTools: readonly string[];
  approvalRequiredTools: readonly string[];
  /** Optional frozen approval-policy hash (`sha256:…`). */
  approvalPolicyHash?: string;
};

export type AgentSpecPolicyFinding =
  | { kind: "missing_connector"; connectorName: string }
  | { kind: "unexpected_enabled_tool"; toolSlug: string }
  | { kind: "missing_enabled_tool"; toolSlug: string }
  | { kind: "lost_approval_rule"; toolSlug: string }
  | { kind: "approval_policy_hash_mismatch"; expected: string; observed: string };

/**
 * Independently verify compiled AgentSpec connector enable/approval surfaces.
 * Connector tool-list checks do not replace this — both are mandatory (runtime.md).
 */
export function verifyCompiledAgentSpecPolicy(
  spec: TrueForgeAgentSpec,
  expected: AgentSpecPolicyExpectation,
): AgentSpecPolicyFinding[] {
  const findings: AgentSpecPolicyFinding[] = [];
  const server = (spec.mcp_servers ?? []).find((row) => row.name === expected.connectorName);
  if (!server) {
    findings.push({ kind: "missing_connector", connectorName: expected.connectorName });
    return findings;
  }

  findings.push(...compareToolSets(server, expected));

  if (expected.approvalPolicyHash) {
    const observed = hashApprovalPolicy(spec);
    if (observed !== expected.approvalPolicyHash) {
      findings.push({
        kind: "approval_policy_hash_mismatch",
        expected: expected.approvalPolicyHash,
        observed,
      });
    }
  }

  return findings;
}

function compareToolSets(
  server: TrueForgeMcpServerRef,
  expected: AgentSpecPolicyExpectation,
): AgentSpecPolicyFinding[] {
  const findings: AgentSpecPolicyFinding[] = [];
  const expectedEnabled = new Set(expected.enabledTools);
  const expectedApproval = new Set(expected.approvalRequiredTools);

  for (const tool of server.enable_tools) {
    if (!expectedEnabled.has(tool)) {
      findings.push({ kind: "unexpected_enabled_tool", toolSlug: tool });
    }
  }
  for (const tool of expected.enabledTools) {
    if (!server.enable_tools.includes(tool)) {
      findings.push({ kind: "missing_enabled_tool", toolSlug: tool });
    }
  }
  for (const tool of expected.approvalRequiredTools) {
    if (!server.require_approval_for_tools.includes(tool)) {
      findings.push({ kind: "lost_approval_rule", toolSlug: tool });
    }
  }
  // Extra approval rules beyond the expected set are allowed only when they are
  // still within enable_tools; unexpected enable tools are already flagged above.
  for (const tool of server.require_approval_for_tools) {
    if (tool.startsWith("@")) {
      continue;
    }
    if (!expectedApproval.has(tool) && !expectedEnabled.has(tool)) {
      findings.push({ kind: "unexpected_enabled_tool", toolSlug: tool });
    }
  }
  return findings;
}

export function assertAgentSpecPolicyHealthy(findings: AgentSpecPolicyFinding[]): void {
  if (findings.length === 0) {
    return;
  }
  throw new Error(
    `P0-302 AgentSpec policy verification failed (dispatch blocked): ${findings
      .map((finding) => finding.kind)
      .join(", ")}`,
  );
}
