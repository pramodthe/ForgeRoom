import { createHash } from "node:crypto";
import { P0_COMPOSIO_DESCRIPTOR_HASHES } from "./descriptors";
import { compareAccountHealth, type ConnectedAccountHealth } from "./manifest-verification";
import { P0_COMPOSIO_DIRECT_TOOLS, P0_COMPOSIO_TOOLKIT } from "./p0-contract";
import { P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME } from "./policy";
import { P0_COMPOSIO_READ_TOOL, p0DemoReadArguments } from "./real-read";
import { redactConnectedAccountId } from "./redact";

/** Stable ForgeRoom connection id for the single P0 Composio github binding. */
export const P0_COMPOSIO_CONNECTION_ID = "connection_composio_github" as const;

export type ConnectionStatusValue =
  "unconfigured" | "connecting" | "active" | "expired" | "revoked" | "drifted";

export type ConnectionToolkitHealth =
  "healthy" | "expired" | "disabled" | "inactive" | "drifted" | "unconfigured";

export type ConnectionActingIdentity = {
  service: string;
  account_display: string;
  principal_type: "user" | "service_account" | "application" | "bot";
  principal_display: string;
  principal_id_hash: string;
};

export type PinnedAccountObservation = ConnectedAccountHealth & {
  scopes: string[];
  authConfigId?: string;
};

export type ConnectionToolDescriptor = {
  tool_name: string;
  descriptor_hash: string;
};

export type ConnectionStatusSnapshot = {
  schemaVersion: 1;
  id: string;
  workspace_id: string;
  provider: "composio";
  toolkit: string;
  trueforge_connector_name: string;
  status: ConnectionStatusValue;
  blocks_dispatch: boolean;
  run_step_state: "blocked_connection" | null;
  acting_identity: ConnectionActingIdentity;
  owner_class: "workspace_service";
  scopes: string[];
  toolkit_health: ConnectionToolkitHealth;
  tools: ConnectionToolDescriptor[];
  account_suffix: string;
  verified_at: string | null;
  catalog_browse_allowed: false;
  account_selection_allowed: false;
  capability_expansion_allowed: false;
};

export type ConnectionTestSnapshot = {
  schemaVersion: 1;
  connection_id: string;
  ok: boolean;
  status: ConnectionStatusValue;
  blocks_dispatch: boolean;
  run_step_state: "blocked_connection" | null;
  checked_tool: string;
  checked_descriptor_hash: string;
  verified_at: string;
  safe_summary: string | null;
  reason: string | null;
};

export type BuildConnectionStatusInput = {
  workspaceId: string;
  connectionId?: string;
  account: PinnedAccountObservation;
  expectedConnectedAccountId: string;
  verifiedAt?: string | null;
  actingIdentity?: ConnectionActingIdentity;
};

export type ConnectionDispatchGate = {
  status: ConnectionStatusValue;
  toolkitHealth: ConnectionToolkitHealth;
  blocksDispatch: boolean;
  /** Application run-step state when auth is missing/expired (TL-008). */
  runStepState: "blocked_connection" | null;
  findingKinds: string[];
  /** True when an alternate account was offered and rejected. */
  fallbackAccountRejected: boolean;
};

function hashPrincipalId(accountId: string): string {
  return `sha256:${createHash("sha256").update(`composio:${accountId}`).digest("hex")}`;
}

/** Safe acting identity for the fixed workspace service account (CN-005). */
export function buildP0ActingIdentity(accountId: string): ConnectionActingIdentity {
  const suffix = redactConnectedAccountId(accountId);
  return {
    service: "github",
    account_display: `github-…${suffix}`,
    principal_type: "service_account",
    principal_display: "ForgeRoom workspace GitHub",
    principal_id_hash: hashPrincipalId(accountId),
  };
}

export function parseGrantedScopes(raw: unknown): string[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return [];
  }
  const record = raw as Record<string, unknown>;
  if (Array.isArray(record.requested_scopes)) {
    return record.requested_scopes.filter(
      (s): s is string => typeof s === "string" && s.length > 0,
    );
  }
  const data = record.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const scope = (data as Record<string, unknown>).scope;
    if (typeof scope === "string" && scope.trim()) {
      return scope
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  const params = record.params;
  if (params && typeof params === "object" && !Array.isArray(params)) {
    const scope = (params as Record<string, unknown>).scope;
    if (typeof scope === "string" && scope.trim()) {
      return scope
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

/**
 * Map pinned-account health to ConnectionStatus + blocked_connection gate.
 * Never selects an alternate account (TL-008 / CN-006).
 */
export function evaluatePinnedConnectionGate(input: {
  account: ConnectedAccountHealth;
  expectedConnectedAccountId: string;
  /** Optional alternate account observed during reconnect — must not become the acting pin. */
  observedAlternateAccountId?: string | null;
}): ConnectionDispatchGate {
  const expected = input.expectedConnectedAccountId.trim();
  const observed = input.account.id?.trim() ?? "";
  const findings = compareAccountHealth(input.account, P0_COMPOSIO_TOOLKIT);
  const findingKinds = findings.map((f) => f.kind);

  let fallbackAccountRejected = false;
  if (
    input.observedAlternateAccountId &&
    input.observedAlternateAccountId.trim() &&
    input.observedAlternateAccountId.trim() !== expected
  ) {
    fallbackAccountRejected = true;
  }

  if (!observed || observed !== expected) {
    return {
      status: "drifted",
      toolkitHealth: "drifted",
      blocksDispatch: true,
      runStepState: "blocked_connection",
      findingKinds: [...findingKinds, "account_mismatch"].sort(),
      fallbackAccountRejected: true,
    };
  }

  if (findings.some((f) => f.kind === "disabled_account")) {
    return {
      status: "revoked",
      toolkitHealth: "disabled",
      blocksDispatch: true,
      runStepState: "blocked_connection",
      findingKinds,
      fallbackAccountRejected,
    };
  }

  if (findings.some((f) => f.kind === "expired_account")) {
    return {
      status: "expired",
      toolkitHealth: "expired",
      blocksDispatch: true,
      runStepState: "blocked_connection",
      findingKinds,
      fallbackAccountRejected,
    };
  }

  if (findings.some((f) => f.kind === "wrong_toolkit" || f.kind === "account_inactive")) {
    return {
      status: "drifted",
      toolkitHealth: findings.some((f) => f.kind === "wrong_toolkit") ? "drifted" : "inactive",
      blocksDispatch: true,
      runStepState: "blocked_connection",
      findingKinds,
      fallbackAccountRejected,
    };
  }

  const statusUpper = input.account.status.trim().toUpperCase();
  if (statusUpper === "INITIATED" || statusUpper === "CONNECTING") {
    return {
      status: "connecting",
      toolkitHealth: "inactive",
      blocksDispatch: true,
      runStepState: "blocked_connection",
      findingKinds,
      fallbackAccountRejected,
    };
  }

  return {
    status: "active",
    toolkitHealth: "healthy",
    blocksDispatch: false,
    runStepState: null,
    findingKinds: [],
    fallbackAccountRejected,
  };
}

export function listP0ConnectionTools(): ConnectionToolDescriptor[] {
  return P0_COMPOSIO_DIRECT_TOOLS.map((tool_name) => ({
    tool_name,
    descriptor_hash: `sha256:${P0_COMPOSIO_DESCRIPTOR_HASHES[tool_name]}`,
  }));
}

function normalizeDescriptorHash(hash: string): string {
  const trimmed = hash.trim();
  return trimmed.startsWith("sha256:") ? trimmed.slice("sha256:".length) : trimmed;
}

export function buildConnectionStatusView(
  input: BuildConnectionStatusInput,
): ConnectionStatusSnapshot {
  const connectionId = input.connectionId ?? P0_COMPOSIO_CONNECTION_ID;
  const gate = evaluatePinnedConnectionGate({
    account: input.account,
    expectedConnectedAccountId: input.expectedConnectedAccountId,
  });
  const actingIdentity =
    input.actingIdentity ?? buildP0ActingIdentity(input.expectedConnectedAccountId);

  return {
    schemaVersion: 1,
    id: connectionId,
    workspace_id: input.workspaceId,
    provider: "composio",
    toolkit: P0_COMPOSIO_TOOLKIT,
    trueforge_connector_name: P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME,
    status: gate.status,
    blocks_dispatch: gate.blocksDispatch,
    run_step_state: gate.runStepState,
    acting_identity: actingIdentity,
    owner_class: "workspace_service",
    scopes: [...input.account.scopes].sort(),
    toolkit_health: gate.toolkitHealth,
    tools: listP0ConnectionTools(),
    account_suffix: redactConnectedAccountId(input.expectedConnectedAccountId),
    verified_at: input.verifiedAt ?? null,
    catalog_browse_allowed: false,
    account_selection_allowed: false,
    capability_expansion_allowed: false,
  };
}

export type SafeConnectionTestInput = {
  connectionId: string;
  expectedDescriptorHash: string;
  account: PinnedAccountObservation;
  expectedConnectedAccountId: string;
  /** Result of a read-only direct-tool execute (or null when skipped due to blocked gate). */
  execute?: {
    httpStatus: number;
    successful: boolean | null;
    authFailure: boolean;
  } | null;
  now?: string;
};

/**
 * Connections Test is read-only: exact GITHUB_GET_AN_ISSUE against the pinned account.
 * Expired auth → blocked_connection; never falls back to another account.
 */
export function evaluateConnectionTest(input: SafeConnectionTestInput): ConnectionTestSnapshot {
  const now = input.now ?? new Date().toISOString();
  const gate = evaluatePinnedConnectionGate({
    account: input.account,
    expectedConnectedAccountId: input.expectedConnectedAccountId,
  });
  const expectedHash = `sha256:${P0_COMPOSIO_DESCRIPTOR_HASHES[P0_COMPOSIO_READ_TOOL]}`;

  if (
    normalizeDescriptorHash(input.expectedDescriptorHash) !== normalizeDescriptorHash(expectedHash)
  ) {
    return {
      schemaVersion: 1,
      connection_id: input.connectionId,
      ok: false,
      status: "drifted",
      blocks_dispatch: true,
      run_step_state: "blocked_connection",
      checked_tool: P0_COMPOSIO_READ_TOOL,
      checked_descriptor_hash: expectedHash,
      verified_at: now,
      safe_summary: null,
      reason: "descriptor_hash_mismatch",
    };
  }

  if (gate.blocksDispatch) {
    return {
      schemaVersion: 1,
      connection_id: input.connectionId,
      ok: false,
      status: gate.status,
      blocks_dispatch: true,
      run_step_state: "blocked_connection",
      checked_tool: P0_COMPOSIO_READ_TOOL,
      checked_descriptor_hash: expectedHash,
      verified_at: now,
      safe_summary: null,
      reason: gate.findingKinds[0] ?? "blocked_connection",
    };
  }

  if (!input.execute) {
    return {
      schemaVersion: 1,
      connection_id: input.connectionId,
      ok: false,
      status: gate.status,
      blocks_dispatch: false,
      run_step_state: null,
      checked_tool: P0_COMPOSIO_READ_TOOL,
      checked_descriptor_hash: expectedHash,
      verified_at: now,
      safe_summary: null,
      reason: "test_execute_missing",
    };
  }

  if (input.execute.authFailure) {
    return {
      schemaVersion: 1,
      connection_id: input.connectionId,
      ok: false,
      status: "expired",
      blocks_dispatch: true,
      run_step_state: "blocked_connection",
      checked_tool: P0_COMPOSIO_READ_TOOL,
      checked_descriptor_hash: expectedHash,
      verified_at: now,
      safe_summary: null,
      reason: "expired_account",
    };
  }

  const ok =
    input.execute.httpStatus < 400 &&
    input.execute.successful !== false &&
    !input.execute.authFailure;

  return {
    schemaVersion: 1,
    connection_id: input.connectionId,
    ok,
    status: ok ? "active" : "drifted",
    blocks_dispatch: !ok,
    run_step_state: ok ? null : "blocked_connection",
    checked_tool: P0_COMPOSIO_READ_TOOL,
    checked_descriptor_hash: expectedHash,
    verified_at: now,
    safe_summary: ok
      ? `Read-only check of ${P0_COMPOSIO_READ_TOOL} succeeded for ${JSON.stringify(p0DemoReadArguments())}`
      : null,
    reason: ok ? null : "read_check_failed",
  };
}

export type ConnectLinkResponse = {
  linkToken: string;
  redirectUrl: string;
  expiresAt: string;
  /** Provider may allocate a provisional account id — never adopt as the pinned pin. */
  provisionalConnectedAccountId: string | null;
};

export type ReconnectBinding = {
  intentId: string;
  connectionId: string;
  workspaceId: string;
  actorUserId: string;
  expectedConnectedAccountId: string;
  redirectUrl: string;
  expiresAt: string;
  provisionalConnectedAccountId: string | null;
  createdAt: string;
};

export function assertReconnectBoundToWorkspace(input: {
  binding: ReconnectBinding;
  workspaceId: string;
  connectionId: string;
  now?: string;
}):
  | { ok: true }
  | {
      ok: false;
      reason: "wrong_workspace" | "wrong_connection" | "link_expired";
    } {
  if (input.binding.workspaceId !== input.workspaceId) {
    return { ok: false, reason: "wrong_workspace" };
  }
  if (input.binding.connectionId !== input.connectionId) {
    return { ok: false, reason: "wrong_connection" };
  }
  const nowMs = Date.parse(input.now ?? new Date().toISOString());
  const expiresMs = Date.parse(input.binding.expiresAt);
  if (Number.isFinite(expiresMs) && nowMs > expiresMs) {
    return { ok: false, reason: "link_expired" };
  }
  return { ok: true };
}

/** Redacted evidence for fixtures / task notes (no secrets, no full account ids). */
export function toRedactedConnectionEvidence(view: ConnectionStatusSnapshot): {
  ownerTask: "P0-304";
  connectionId: string;
  toolkit: string;
  status: ConnectionStatusValue;
  blocksDispatch: boolean;
  runStepState: "blocked_connection" | null;
  accountSuffix: string;
  scopes: string[];
  toolNames: string[];
  descriptorHashes: string[];
  catalogBrowseAllowed: false;
  accountSelectionAllowed: false;
  capabilityExpansionAllowed: false;
} {
  return {
    ownerTask: "P0-304",
    connectionId: view.id,
    toolkit: view.toolkit,
    status: view.status,
    blocksDispatch: view.blocks_dispatch,
    runStepState: view.run_step_state,
    accountSuffix: view.account_suffix,
    scopes: view.scopes,
    toolNames: view.tools.map((t) => t.tool_name).sort(),
    descriptorHashes: view.tools.map((t) => t.descriptor_hash).sort(),
    catalogBrowseAllowed: false,
    accountSelectionAllowed: false,
    capabilityExpansionAllowed: false,
  };
}
