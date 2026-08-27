import { describe, expect, it } from "vitest";
import {
  P0_COMPOSIO_DESCRIPTOR_HASHES,
  compareDescriptorHashes,
  hashComposioToolDescriptorBody,
} from "./descriptors";
import {
  P0_COMPOSIO_APPROVAL_REQUIRED_TOOLS,
  P0_COMPOSIO_ENABLED_TOOLS,
  P0_COMPOSIO_ENABLED_TOOLS_HASH,
  P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME,
  compareCompiledAllowlist,
} from "./policy";
import {
  assertP0ManifestHealthy,
  verifyP0Manifest,
  verifyP0ManifestForDispatch,
} from "./manifest-verification";
import { P0_COMPOSIO_DIRECT_TOOLS } from "./p0-contract";

const healthyAccount = {
  id: "ca_xxxxnizY",
  status: "ACTIVE",
  isDisabled: false,
  toolkitSlug: "github",
};

const healthyAllowlist = {
  connectorName: P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME,
  enabledTools: [...P0_COMPOSIO_ENABLED_TOOLS],
  approvalRequiredTools: [...P0_COMPOSIO_APPROVAL_REQUIRED_TOOLS],
};

const healthyDescriptors = P0_COMPOSIO_DIRECT_TOOLS.map((toolSlug) => ({
  toolSlug,
  sha256: P0_COMPOSIO_DESCRIPTOR_HASHES[toolSlug],
}));

describe("descriptor hash comparison", () => {
  it("accepts exact checked-in hashes", () => {
    expect(compareDescriptorHashes(healthyDescriptors)).toEqual([]);
  });

  it("fails closed on missing tool", () => {
    const findings = compareDescriptorHashes(healthyDescriptors.slice(0, 2));
    expect(findings.some((row) => row.kind === "missing_tool")).toBe(true);
  });

  it("fails closed on added tool", () => {
    const findings = compareDescriptorHashes([
      ...healthyDescriptors,
      { toolSlug: "GITHUB_CREATE_AN_ISSUE", sha256: "ab".repeat(32) },
    ]);
    expect(findings.some((row) => row.kind === "added_tool")).toBe(true);
    expect(findings.some((row) => row.kind === "unapproved_surface")).toBe(true);
  });

  it("fails closed on schema change", () => {
    const findings = compareDescriptorHashes([
      {
        toolSlug: "GITHUB_GET_AN_ISSUE",
        sha256: "00".repeat(32),
      },
      ...healthyDescriptors.slice(1),
    ]);
    expect(findings).toContainEqual({
      kind: "schema_change",
      toolSlug: "GITHUB_GET_AN_ISSUE",
      expected: P0_COMPOSIO_DESCRIPTOR_HASHES.GITHUB_GET_AN_ISSUE,
      observed: "00".repeat(32),
    });
  });

  it("hashes raw descriptor bodies with sha256 hex", () => {
    expect(hashComposioToolDescriptorBody('{"slug":"x"}')).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("compiled allowlist / policy hashes", () => {
  it("accepts the frozen enable and approval sets", () => {
    expect(compareCompiledAllowlist(healthyAllowlist)).toEqual([]);
    expect(P0_COMPOSIO_ENABLED_TOOLS_HASH.startsWith("sha256:")).toBe(true);
  });

  it("rejects unexpected allowlist tools", () => {
    const findings = compareCompiledAllowlist({
      ...healthyAllowlist,
      enabledTools: [...P0_COMPOSIO_ENABLED_TOOLS, "GITHUB_CREATE_AN_ISSUE"],
    });
    expect(findings.some((row) => row.kind === "unexpected_allowlist_tool")).toBe(true);
  });

  it("rejects lost approval rules", () => {
    const findings = compareCompiledAllowlist({
      ...healthyAllowlist,
      approvalRequiredTools: ["GITHUB_ADD_LABELS_TO_AN_ISSUE"],
    });
    expect(findings.some((row) => row.kind === "lost_approval_rule")).toBe(true);
  });
});

describe("verifyP0Manifest", () => {
  it("passes when descriptors, account and allowlist match", () => {
    const result = verifyP0Manifest({
      descriptors: healthyDescriptors,
      account: healthyAccount,
      compiledAllowlist: healthyAllowlist,
      connectorToolNames: [...P0_COMPOSIO_ENABLED_TOOLS],
    });
    expect(result.ok).toBe(true);
    expect(result.blocksDispatch).toBe(false);
    expect(result.redacted.accountSuffix).toBe("nizY");
    expect(result.redacted.ownerTask).toBe("P0-302");
  });

  it("blocks dispatch on expired account", () => {
    const result = verifyP0Manifest({
      descriptors: healthyDescriptors,
      account: { ...healthyAccount, status: "EXPIRED" },
      compiledAllowlist: healthyAllowlist,
    });
    expect(result.ok).toBe(false);
    expect(result.blocksDispatch).toBe(true);
    expect(result.findings.some((row) => row.kind === "expired_account")).toBe(true);
    expect(() => assertP0ManifestHealthy(result)).toThrow(/dispatch blocked/);
  });

  it("blocks dispatch on missing tool fixture", () => {
    const result = verifyP0Manifest({
      descriptors: healthyDescriptors.slice(0, 1),
      account: healthyAccount,
      compiledAllowlist: healthyAllowlist,
    });
    expect(result.findings.some((row) => row.kind === "missing_tool")).toBe(true);
  });

  it("blocks dispatch on schema change fixture", () => {
    const result = verifyP0Manifest({
      descriptors: [
        { toolSlug: "GITHUB_GET_AN_ISSUE", sha256: "ff".repeat(32) },
        ...healthyDescriptors.slice(1),
      ],
      account: healthyAccount,
      compiledAllowlist: healthyAllowlist,
    });
    expect(result.findings.some((row) => row.kind === "schema_change")).toBe(true);
  });

  it("blocks dispatch on added tool fixture", () => {
    const result = verifyP0Manifest({
      descriptors: [
        ...healthyDescriptors,
        { toolSlug: "COMPOSIO_SEARCH_TOOLS", sha256: "aa".repeat(32) },
      ],
      account: healthyAccount,
      compiledAllowlist: healthyAllowlist,
    });
    expect(result.findings.some((row) => row.kind === "added_tool")).toBe(true);
  });

  it("blocks dispatch on lost approval rule fixture", () => {
    const result = verifyP0Manifest({
      descriptors: healthyDescriptors,
      account: healthyAccount,
      compiledAllowlist: {
        ...healthyAllowlist,
        approvalRequiredTools: [],
      },
    });
    expect(result.findings.some((row) => row.kind === "lost_approval_rule")).toBe(true);
  });
});

describe("verifyP0ManifestForDispatch", () => {
  it("blocks dispatch when the observed account id does not match the pinned account", async () => {
    const result = await verifyP0ManifestForDispatch({
      pinnedConnectedAccountId: "ca_pinned",
      async getConnectedAccountDetails() {
        return {
          id: "ca_other",
          status: "ACTIVE",
          isDisabled: false,
          toolkitSlug: "github",
        };
      },
    });
    expect(result.ok).toBe(false);
    expect(result.blocksDispatch).toBe(true);
    expect(result.findings).toContainEqual({
      kind: "account_mismatch",
      expected: "ca_pinned",
      observed: "ca_other",
    });
  });

  it("passes when the observed account matches the pinned account", async () => {
    const result = await verifyP0ManifestForDispatch({
      pinnedConnectedAccountId: healthyAccount.id,
      async getConnectedAccountDetails() {
        return healthyAccount;
      },
    });
    expect(result.ok).toBe(true);
    expect(result.blocksDispatch).toBe(false);
  });
});
