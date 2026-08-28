import { compareAccountHealth, type ConnectedAccountHealth } from "./manifest-verification";
import {
  findForbiddenSurfaces,
  P0_COMPOSIO_DIRECT_TOOLS,
  P0_COMPOSIO_FORBIDDEN_SURFACES,
} from "./p0-contract";
import { P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME } from "./policy";
import { redactConnectedAccountId } from "./redact";
import {
  demoGetIssueArgs,
  requireToolPolicy,
  type RedactedArguments,
  type SafeTargetSummary,
  type VerifiedProviderReceipt,
} from "./tool-policies";
import { ToolPolicyError } from "./tool-policies/types";
import type { P0ComposioDirectToolSlug } from "./types";

/** Frozen P0 real-read tool (demo.md / OD-003). */
export const P0_COMPOSIO_READ_TOOL =
  "GITHUB_GET_AN_ISSUE" as const satisfies P0ComposioDirectToolSlug;

export type ReadPreflightFailureReason =
  | "expired_account"
  | "disabled_account"
  | "account_inactive"
  | "account_mismatch"
  | "wrong_toolkit"
  | "unknown_tool"
  | "meta_tool_rejected"
  | "tool_not_on_connector"
  | "not_read_tool"
  | "descriptor_hash_mismatch"
  | "descriptor_hash_missing";

export type ReadDispatchPreflightInput = {
  /** Exact pinned connected-account health from Composio. */
  account: ConnectedAccountHealth;
  /** Exact account ID expected for this workspace pin. */
  expectedConnectedAccountId: string;
  /** Tool the coworker/TrueForge is about to invoke. */
  toolSlug: string;
  /**
   * Tool names exposed by the TrueForge header-auth MCP connector.
   * Must include the exact read tool and must not include meta surfaces.
   */
  connectorToolNames: readonly string[];
  /** Optional observed descriptor hash for the read tool. */
  observedDescriptorHash?: string;
  expectedToolkit?: string;
};

export type ReadDispatchPreflightSuccess = {
  ok: true;
  blocksDispatch: false;
  toolSlug: typeof P0_COMPOSIO_READ_TOOL;
  accountSuffix: string;
  connectorName: typeof P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME;
  descriptorHash: string;
};

export type ReadDispatchPreflightFailure = {
  ok: false;
  blocksDispatch: true;
  reason: ReadPreflightFailureReason;
  /** Expired/missing auth maps to application blocked_connection (TL-008). */
  runStepState: "blocked_connection" | null;
  accountSuffix: string;
  toolSlug: string;
  findingKinds: string[];
};

export type ReadDispatchPreflightResult =
  ReadDispatchPreflightSuccess | ReadDispatchPreflightFailure;

export type ComposioToolExecuteRequest = {
  toolSlug: string;
  arguments: Record<string, unknown>;
  connectedAccountId?: string;
  userId?: string;
};

export type ComposioToolExecuteResult = {
  toolSlug: string;
  httpStatus: number;
  /** Raw provider payload — process-memory only; never persist or send to browser. */
  raw: unknown;
  successful: boolean | null;
  authFailure: boolean;
};

export type SafeReadResultSummary = {
  coworkerId: string;
  toolName: typeof P0_COMPOSIO_READ_TOOL;
  connectorName: typeof P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME;
  accountSuffix: string;
  riskClass: "read";
  target: SafeTargetSummary;
  redactedArguments: RedactedArguments;
  resultSummary: string;
  receipt: VerifiedProviderReceipt | null;
  /** Hash-only marker that a raw body was observed server-side (never the body). */
  rawResultObserved: boolean;
  rawResultByteLength: number | null;
};

/**
 * Fail-closed preflight: exact pinned account + exact direct read tool before dispatch.
 * Does not substitute alternate accounts (ADR-003 / TL-004 / TL-008).
 */
export function preflightExactReadDispatch(
  input: ReadDispatchPreflightInput,
): ReadDispatchPreflightResult {
  const accountSuffix = redactConnectedAccountId(input.expectedConnectedAccountId);
  const toolSlug = input.toolSlug.trim();
  const findingKinds: string[] = [];

  if (input.account.id !== input.expectedConnectedAccountId) {
    findingKinds.push("account_mismatch");
    return failure("account_mismatch", toolSlug, accountSuffix, findingKinds, "blocked_connection");
  }

  const accountFindings = compareAccountHealth(input.account, input.expectedToolkit ?? "github");
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

  if (toolSlug !== P0_COMPOSIO_READ_TOOL) {
    findingKinds.push("not_read_tool");
    return failure("not_read_tool", toolSlug, accountSuffix, findingKinds, null);
  }

  if (!input.connectorToolNames.includes(P0_COMPOSIO_READ_TOOL)) {
    findingKinds.push("tool_not_on_connector");
    return failure("tool_not_on_connector", toolSlug, accountSuffix, findingKinds, null);
  }

  let policy;
  try {
    policy = requireToolPolicy(P0_COMPOSIO_READ_TOOL);
  } catch {
    findingKinds.push("unknown_tool");
    return failure("unknown_tool", toolSlug, accountSuffix, findingKinds, null);
  }

  if (!input.observedDescriptorHash) {
    findingKinds.push("descriptor_hash_missing");
    return failure("descriptor_hash_missing", toolSlug, accountSuffix, findingKinds, null);
  }
  if (input.observedDescriptorHash !== policy.observedDescriptorHash) {
    findingKinds.push("descriptor_hash_mismatch");
    return failure("descriptor_hash_mismatch", toolSlug, accountSuffix, findingKinds, null);
  }

  return {
    ok: true,
    blocksDispatch: false,
    toolSlug: P0_COMPOSIO_READ_TOOL,
    accountSuffix,
    connectorName: P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME,
    descriptorHash: policy.observedDescriptorHash,
  };
}

function failure(
  reason: ReadPreflightFailureReason,
  toolSlug: string,
  accountSuffix: string,
  findingKinds: string[],
  runStepState: "blocked_connection" | null,
): ReadDispatchPreflightFailure {
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

/** Detect Composio/OAuth auth expiry style failures from execute payloads. */
export function isComposioAuthFailure(raw: unknown, httpStatus?: number): boolean {
  if (httpStatus === 401 || httpStatus === 403) {
    const text =
      typeof raw === "string" ? raw : raw && typeof raw === "object" ? JSON.stringify(raw) : "";
    if (/expired|unauthorized|invalid.?token|reauth|reconnect|oauth|auth/i.test(text)) {
      return true;
    }
    // Strict 401 always counts as auth failure for pinned-account dispatch.
    if (httpStatus === 401) {
      return true;
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return false;
  }
  const root = raw as Record<string, unknown>;
  const error =
    root.error && typeof root.error === "object" ? (root.error as Record<string, unknown>) : root;
  const message = String(error.message ?? error.error ?? root.message ?? "");
  const code = String(error.code ?? root.code ?? "");
  return /expired|token.?expired|unauthorized|reauth|reconnect|invalid.?grant|oauth/i.test(
    `${code} ${message}`,
  );
}

/**
 * Build the channel-safe attributed read result.
 * Raw provider bodies stay out of the returned object (only length/observed flags).
 */
export function buildSafeReadResultSummary(input: {
  coworkerId: string;
  accountSuffix: string;
  arguments: unknown;
  rawResult: unknown;
}): SafeReadResultSummary {
  if (!input.coworkerId.trim()) {
    throw new ToolPolicyError("invalid_arguments", "coworkerId is required for attributed read");
  }
  const policy = requireToolPolicy(P0_COMPOSIO_READ_TOOL);
  const target = policy.extractTarget(input.arguments);
  const redactedArguments = policy.redactArguments(input.arguments);
  const receipt = policy.verifyReceipt?.(input.rawResult, input.arguments) ?? null;
  const resultSummary = receipt?.summary ?? `Safe read summary for ${target.display}`;

  const rawSerialized =
    input.rawResult === undefined || input.rawResult === null
      ? null
      : typeof input.rawResult === "string"
        ? input.rawResult
        : JSON.stringify(input.rawResult);

  return {
    coworkerId: input.coworkerId,
    toolName: P0_COMPOSIO_READ_TOOL,
    connectorName: P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME,
    accountSuffix: input.accountSuffix,
    riskClass: "read",
    target,
    redactedArguments,
    resultSummary,
    receipt,
    rawResultObserved: rawSerialized !== null,
    rawResultByteLength: rawSerialized === null ? null : Buffer.byteLength(rawSerialized, "utf8"),
  };
}

/** Canonical demo read arguments for live probes. */
export function p0DemoReadArguments(): Record<string, unknown> {
  return demoGetIssueArgs();
}

/**
 * Assert a TrueForge-observed tool name is the literal direct read tool.
 * Rejects wrapper meta-tools (ADR-003).
 */
export function assertTrueForgeInvokedDirectReadTool(observedToolName: string): void {
  const name = observedToolName.trim();
  if ((P0_COMPOSIO_FORBIDDEN_SURFACES as readonly string[]).includes(name)) {
    throw new Error(
      `TrueForge invoked forbidden meta-tool ${name}; expected direct ${P0_COMPOSIO_READ_TOOL}`,
    );
  }
  if (name !== P0_COMPOSIO_READ_TOOL) {
    throw new Error(
      `TrueForge invoked ${name}; expected direct read tool ${P0_COMPOSIO_READ_TOOL}`,
    );
  }
}

/** Redacted evidence suitable for checked-in fixtures (no secrets / raw bodies). */
export function toRedactedReadEvidence(summary: SafeReadResultSummary): Record<string, unknown> {
  return {
    ownerTask: "P0-305",
    coworkerIdPresent: Boolean(summary.coworkerId),
    toolName: summary.toolName,
    connectorName: summary.connectorName,
    accountSuffix: summary.accountSuffix,
    riskClass: summary.riskClass,
    targetDisplay: summary.target.display,
    redactedArgumentKeys: Object.keys(summary.redactedArguments).sort(),
    resultSummary: summary.resultSummary,
    receiptKind: summary.receipt?.kind ?? null,
    rawResultObserved: summary.rawResultObserved,
    rawResultByteLength: summary.rawResultByteLength,
    // Explicit absence markers for security scans of the fixture.
    rawResultBodyPresent: false,
    credentialsPresent: false,
  };
}
