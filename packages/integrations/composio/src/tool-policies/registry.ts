import { P0_COMPOSIO_DESCRIPTOR_HASHES } from "../descriptors";
import { P0_COMPOSIO_DIRECT_TOOLS } from "../p0-contract";
import {
  githubAddLabelsToAnIssuePolicy,
  githubGetAnIssuePolicy,
  githubRemoveLabelFromAnIssuePolicy,
} from "./policies";
import type { ToolPolicyDefinition } from "./types";
import { ToolPolicyError } from "./types";

const POLICY_LIST: readonly ToolPolicyDefinition[] = [
  githubGetAnIssuePolicy,
  githubAddLabelsToAnIssuePolicy,
  githubRemoveLabelFromAnIssuePolicy,
] as const;

const POLICY_BY_NAME = new Map<string, ToolPolicyDefinition>(
  POLICY_LIST.map((policy) => [policy.toolName, policy]),
);

/**
 * Curated ToolPolicyDefinitions for every P0 enabled Composio direct tool.
 * Unknown write tools are unavailable (fail closed).
 */
export const P0_TOOL_POLICIES: Readonly<Record<string, ToolPolicyDefinition>> = Object.freeze(
  Object.fromEntries(POLICY_LIST.map((policy) => [policy.toolName, policy])),
);

export function listToolPolicies(): readonly ToolPolicyDefinition[] {
  return POLICY_LIST;
}

export function getToolPolicy(toolName: string): ToolPolicyDefinition | null {
  return POLICY_BY_NAME.get(toolName) ?? null;
}

export function requireToolPolicy(toolName: string): ToolPolicyDefinition {
  const policy = getToolPolicy(toolName);
  if (!policy) {
    throw new ToolPolicyError("unknown_tool", `no ToolPolicyDefinition for tool: ${toolName}`);
  }
  return policy;
}

/**
 * Writes without a reviewed policy (or with riskClass blocked) are unavailable.
 */
export function assertWriteToolAllowed(toolName: string): ToolPolicyDefinition {
  const policy = getToolPolicy(toolName);
  if (!policy) {
    throw new ToolPolicyError(
      "unknown_write_blocked",
      `unknown write blocked: no ToolPolicyDefinition for ${toolName}`,
    );
  }
  if (policy.riskClass === "blocked") {
    throw new ToolPolicyError(
      "unknown_write_blocked",
      `write blocked by policy riskClass for ${toolName}`,
    );
  }
  if (policy.riskClass === "read") {
    throw new ToolPolicyError(
      "unknown_write_blocked",
      `read tool cannot be used as a write: ${toolName}`,
    );
  }
  if (
    policy.idempotency === "unknown" &&
    (policy.riskClass === "write" || policy.riskClass === "destructive")
  ) {
    throw new ToolPolicyError(
      "unknown_write_blocked",
      `write with unknown idempotency is blocked: ${toolName}`,
    );
  }
  if (!policy.reconcile || !policy.verifyReceipt) {
    throw new ToolPolicyError(
      "unknown_write_blocked",
      `write missing reconcile/receipt verifier: ${toolName}`,
    );
  }
  return policy;
}

/**
 * Fail closed if any enabled tool lacks a policy or descriptor hash drifts from the policy.
 */
export function assertToolPolicyCoverage(
  enabledTools: readonly string[] = P0_COMPOSIO_DIRECT_TOOLS,
): void {
  for (const tool of enabledTools) {
    const policy = getToolPolicy(tool);
    if (!policy) {
      throw new ToolPolicyError(
        "policy_coverage",
        `enabled tool missing ToolPolicyDefinition: ${tool}`,
      );
    }
    const expectedHash =
      tool in P0_COMPOSIO_DESCRIPTOR_HASHES
        ? P0_COMPOSIO_DESCRIPTOR_HASHES[tool as keyof typeof P0_COMPOSIO_DESCRIPTOR_HASHES]
        : null;
    if (!expectedHash || policy.observedDescriptorHash !== expectedHash) {
      throw new ToolPolicyError(
        "descriptor_hash_mismatch",
        `policy descriptor hash mismatch for ${tool}`,
      );
    }
  }

  for (const required of P0_COMPOSIO_DIRECT_TOOLS) {
    if (!POLICY_BY_NAME.has(required)) {
      throw new ToolPolicyError(
        "policy_coverage",
        `direct tool missing ToolPolicyDefinition: ${required}`,
      );
    }
  }

  for (const policy of POLICY_LIST) {
    if (!(P0_COMPOSIO_DIRECT_TOOLS as readonly string[]).includes(policy.toolName)) {
      throw new ToolPolicyError(
        "policy_coverage",
        `policy registered for non-enabled tool: ${policy.toolName}`,
      );
    }
  }
}

export function describeToolPolicyBoundary(): {
  ownerTask: "P0-303";
  policyCount: number;
  tools: string[];
  unknownWrites: "blocked";
} {
  return {
    ownerTask: "P0-303",
    policyCount: POLICY_LIST.length,
    tools: POLICY_LIST.map((row) => row.toolName),
    unknownWrites: "blocked",
  };
}
