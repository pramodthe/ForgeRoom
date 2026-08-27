import { createHash } from "node:crypto";
import { P0_COMPOSIO_DIRECT_TOOLS } from "./p0-contract";

/**
 * TrueForge MCP connector name for the Composio hosted direct-tools session.
 * Must satisfy TrueForge NameSchema (lowercase) and is distinct from catalog `github`.
 */
export const P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME = "composio_github" as const;

/** Literal enable set compiled into the P0 AgentSpec for the Composio connector. */
export const P0_COMPOSIO_ENABLED_TOOLS = [...P0_COMPOSIO_DIRECT_TOOLS] as const;

/**
 * Mutation tools that must appear in `require_approval_for_tools`.
 * Read (`GITHUB_GET_AN_ISSUE`) is not approval-gated.
 */
export const P0_COMPOSIO_APPROVAL_REQUIRED_TOOLS = [
  "GITHUB_ADD_LABELS_TO_AN_ISSUE",
  "GITHUB_REMOVE_A_LABEL_FROM_AN_ISSUE",
] as const;

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

export function hashPolicyValue(value: unknown): string {
  return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;
}

export const P0_COMPOSIO_ENABLED_TOOLS_HASH = hashPolicyValue({
  connector: P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME,
  enable_tools: [...P0_COMPOSIO_ENABLED_TOOLS],
});

export const P0_COMPOSIO_APPROVAL_REQUIRED_TOOLS_HASH = hashPolicyValue({
  connector: P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME,
  require_approval_for_tools: [...P0_COMPOSIO_APPROVAL_REQUIRED_TOOLS],
});

/**
 * Approval-policy preimage aligned with `hashApprovalPolicy` in @forgeroom/trueforge
 * for the frozen P0 Composio connector alone.
 */
export const P0_COMPOSIO_APPROVAL_POLICY_HASH = hashPolicyValue({
  mcp_servers: [
    {
      name: P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME,
      require_approval_for_tools: [...P0_COMPOSIO_APPROVAL_REQUIRED_TOOLS],
    },
  ],
  dynamic_sub_agents: { enabled: false },
  generative_ui: { enabled: false },
});

export type CoworkerCompiledAllowlist = {
  connectorName: string;
  enabledTools: readonly string[];
  approvalRequiredTools: readonly string[];
};

export type PolicyDriftFinding =
  | { kind: "unexpected_allowlist_tool"; toolSlug: string }
  | { kind: "missing_enabled_tool"; toolSlug: string }
  | { kind: "lost_approval_rule"; toolSlug: string }
  | { kind: "extra_approval_rule"; toolSlug: string }
  | { kind: "enabled_tools_hash_mismatch"; expected: string; observed: string }
  | { kind: "approval_tools_hash_mismatch"; expected: string; observed: string }
  | { kind: "wrong_connector"; expected: string; observed: string };

/**
 * Independently verify compiled coworker enable/approval sets against frozen policy hashes.
 * No unexpected tool may appear in the compiled allowlist.
 */
export function compareCompiledAllowlist(
  compiled: CoworkerCompiledAllowlist,
): PolicyDriftFinding[] {
  const findings: PolicyDriftFinding[] = [];
  const expectedEnabled = new Set<string>(P0_COMPOSIO_ENABLED_TOOLS);
  const expectedApproval = new Set<string>(P0_COMPOSIO_APPROVAL_REQUIRED_TOOLS);

  if (compiled.connectorName !== P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME) {
    findings.push({
      kind: "wrong_connector",
      expected: P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME,
      observed: compiled.connectorName,
    });
  }

  for (const tool of compiled.enabledTools) {
    if (!expectedEnabled.has(tool)) {
      findings.push({ kind: "unexpected_allowlist_tool", toolSlug: tool });
    }
  }
  for (const required of P0_COMPOSIO_ENABLED_TOOLS) {
    if (!compiled.enabledTools.includes(required)) {
      findings.push({ kind: "missing_enabled_tool", toolSlug: required });
    }
  }

  for (const required of P0_COMPOSIO_APPROVAL_REQUIRED_TOOLS) {
    if (!compiled.approvalRequiredTools.includes(required)) {
      findings.push({ kind: "lost_approval_rule", toolSlug: required });
    }
  }
  for (const tool of compiled.approvalRequiredTools) {
    if (!expectedApproval.has(tool)) {
      findings.push({ kind: "extra_approval_rule", toolSlug: tool });
    }
  }

  const observedEnableHash = hashPolicyValue({
    connector: compiled.connectorName,
    enable_tools: [...compiled.enabledTools],
  });
  if (observedEnableHash !== P0_COMPOSIO_ENABLED_TOOLS_HASH) {
    findings.push({
      kind: "enabled_tools_hash_mismatch",
      expected: P0_COMPOSIO_ENABLED_TOOLS_HASH,
      observed: observedEnableHash,
    });
  }

  const observedApprovalHash = hashPolicyValue({
    connector: compiled.connectorName,
    require_approval_for_tools: [...compiled.approvalRequiredTools],
  });
  if (observedApprovalHash !== P0_COMPOSIO_APPROVAL_REQUIRED_TOOLS_HASH) {
    findings.push({
      kind: "approval_tools_hash_mismatch",
      expected: P0_COMPOSIO_APPROVAL_REQUIRED_TOOLS_HASH,
      observed: observedApprovalHash,
    });
  }

  return findings;
}
