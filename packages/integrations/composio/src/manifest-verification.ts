import {
  compareDescriptorHashes,
  P0_COMPOSIO_DESCRIPTOR_HASHES,
  type DescriptorDriftFinding,
  type ObservedToolDescriptor,
} from "./descriptors";
import {
  compareCompiledAllowlist,
  P0_COMPOSIO_APPROVAL_REQUIRED_TOOLS,
  P0_COMPOSIO_ENABLED_TOOLS,
  P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME,
  type CoworkerCompiledAllowlist,
  type PolicyDriftFinding,
} from "./policy";

export type ConnectedAccountHealth = {
  id: string;
  status: string;
  isDisabled: boolean;
  toolkitSlug?: string;
};

export type AccountDriftFinding =
  | { kind: "expired_account"; status: string }
  | { kind: "disabled_account" }
  | { kind: "account_inactive"; status: string }
  | { kind: "wrong_toolkit"; expected: string; observed: string };

export type ManifestVerificationFinding =
  | DescriptorDriftFinding
  | PolicyDriftFinding
  | AccountDriftFinding
  | { kind: "connector_tool_mismatch"; detail: string };

export type ManifestVerificationInput = {
  /** Observed Composio REST tool descriptors (hashed bodies). */
  descriptors: ReadonlyArray<Pick<ObservedToolDescriptor, "toolSlug" | "sha256">>;
  /** Exact pinned connected-account health. */
  account: ConnectedAccountHealth;
  /** Compiled coworker enable/approval allowlist for the Composio connector. */
  compiledAllowlist: CoworkerCompiledAllowlist;
  /**
   * Optional TrueForge connector `tools/list` names.
   * When provided, must equal the compiled enable set (no extras).
   */
  connectorToolNames?: readonly string[];
  /** Expected toolkit for the pinned account (default github). */
  expectedToolkit?: string;
};

export type ManifestVerificationResult =
  | {
      ok: true;
      healthy: true;
      blocksDispatch: false;
      findings: [];
      redacted: ManifestVerificationRedactedEvidence;
    }
  | {
      ok: false;
      healthy: false;
      blocksDispatch: true;
      findings: ManifestVerificationFinding[];
      redacted: ManifestVerificationRedactedEvidence;
    };

export type ManifestVerificationRedactedEvidence = {
  ownerTask: "P0-302";
  accountStatus: string;
  accountSuffix: string;
  descriptorSlugs: string[];
  enabledTools: string[];
  approvalRequiredTools: string[];
  findingKinds: string[];
  healthy: boolean;
  blocksDispatch: boolean;
};

function accountSuffix(id: string): string {
  return id.length >= 4 ? id.slice(-4) : id;
}

export function compareAccountHealth(
  account: ConnectedAccountHealth,
  expectedToolkit = "github",
): AccountDriftFinding[] {
  const findings: AccountDriftFinding[] = [];
  if (account.isDisabled) {
    findings.push({ kind: "disabled_account" });
  }
  const status = account.status.trim().toUpperCase();
  if (status === "EXPIRED" || status.includes("EXPIR")) {
    findings.push({ kind: "expired_account", status: account.status });
  } else if (status !== "ACTIVE") {
    findings.push({ kind: "account_inactive", status: account.status });
  }
  if (account.toolkitSlug && account.toolkitSlug !== expectedToolkit) {
    findings.push({
      kind: "wrong_toolkit",
      expected: expectedToolkit,
      observed: account.toolkitSlug,
    });
  }
  return findings;
}

/**
 * Startup verification: descriptors, pinned account, compiled allowlist, optional connector tools.
 * Any finding fails closed and blocks dispatch.
 */
export function verifyP0Manifest(input: ManifestVerificationInput): ManifestVerificationResult {
  const findings: ManifestVerificationFinding[] = [
    ...compareDescriptorHashes(input.descriptors),
    ...compareAccountHealth(input.account, input.expectedToolkit ?? "github"),
    ...compareCompiledAllowlist(input.compiledAllowlist),
  ];

  if (input.connectorToolNames) {
    const expected = new Set(input.compiledAllowlist.enabledTools);
    const observed = new Set(input.connectorToolNames);
    for (const name of observed) {
      if (!expected.has(name)) {
        findings.push({
          kind: "connector_tool_mismatch",
          detail: `unexpected connector tool: ${name}`,
        });
      }
    }
    for (const name of expected) {
      if (!observed.has(name)) {
        findings.push({
          kind: "connector_tool_mismatch",
          detail: `missing connector tool: ${name}`,
        });
      }
    }
  }

  const redacted: ManifestVerificationRedactedEvidence = {
    ownerTask: "P0-302",
    accountStatus: input.account.status,
    accountSuffix: accountSuffix(input.account.id),
    descriptorSlugs: input.descriptors.map((row) => row.toolSlug).sort(),
    enabledTools: [...input.compiledAllowlist.enabledTools],
    approvalRequiredTools: [...input.compiledAllowlist.approvalRequiredTools],
    findingKinds: findings.map((finding) => finding.kind).sort(),
    healthy: findings.length === 0,
    blocksDispatch: findings.length > 0,
  };

  if (findings.length > 0) {
    return {
      ok: false,
      healthy: false,
      blocksDispatch: true,
      findings,
      redacted,
    };
  }

  return {
    ok: true,
    healthy: true,
    blocksDispatch: false,
    findings: [],
    redacted,
  };
}

/** Throw when verification fails — use before turn dispatch. */
export function assertP0ManifestHealthy(result: ManifestVerificationResult): void {
  if (result.ok) {
    return;
  }
  const summary = result.findings.map((finding) => finding.kind).join(", ");
  throw new Error(
    `P0-302 manifest verification failed (dispatch blocked): ${summary || "unknown drift"}`,
  );
}

const FROZEN_P0_DESCRIPTOR_ROWS: ReadonlyArray<Pick<ObservedToolDescriptor, "toolSlug" | "sha256">> =
  Object.entries(P0_COMPOSIO_DESCRIPTOR_HASHES).map(([toolSlug, sha256]) => ({
    toolSlug,
    sha256,
  }));

const FROZEN_P0_COMPILED_ALLOWLIST: CoworkerCompiledAllowlist = {
  connectorName: P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME,
  enabledTools: P0_COMPOSIO_ENABLED_TOOLS,
  approvalRequiredTools: P0_COMPOSIO_APPROVAL_REQUIRED_TOOLS,
};

/** Build manifest verification input for the frozen P0 Composio connector. */
export function buildFrozenP0ManifestVerificationInput(
  account: ConnectedAccountHealth,
): ManifestVerificationInput {
  return {
    descriptors: FROZEN_P0_DESCRIPTOR_ROWS,
    account,
    compiledAllowlist: FROZEN_P0_COMPILED_ALLOWLIST,
  };
}

/**
 * Fail-closed manifest/policy preflight before ordinary agent turn dispatch.
 * Requires a live pinned connected-account observation from Composio.
 */
export async function verifyP0ManifestForDispatch(composio: {
  getConnectedAccountDetails(): Promise<ConnectedAccountHealth>;
}): Promise<ManifestVerificationResult> {
  const account = await composio.getConnectedAccountDetails();
  if (!account.id) {
    const redacted: ManifestVerificationRedactedEvidence = {
      ownerTask: "P0-302",
      accountStatus: account.status,
      accountSuffix: "",
      descriptorSlugs: FROZEN_P0_DESCRIPTOR_ROWS.map((row) => row.toolSlug).sort(),
      enabledTools: [...FROZEN_P0_COMPILED_ALLOWLIST.enabledTools],
      approvalRequiredTools: [...FROZEN_P0_COMPILED_ALLOWLIST.approvalRequiredTools],
      findingKinds: ["account_inactive"],
      healthy: false,
      blocksDispatch: true,
    };
    return {
      ok: false,
      healthy: false,
      blocksDispatch: true,
      findings: [{ kind: "account_inactive", status: account.status }],
      redacted,
    };
  }
  return verifyP0Manifest(buildFrozenP0ManifestVerificationInput(account));
}
