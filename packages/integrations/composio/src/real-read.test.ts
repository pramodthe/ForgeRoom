import { describe, expect, it } from "vitest";
import {
  P0_COMPOSIO_DESCRIPTOR_HASHES,
  P0_COMPOSIO_ENABLED_TOOLS,
  P0_COMPOSIO_FORBIDDEN_SURFACES,
  P0_COMPOSIO_READ_TOOL,
  assertTrueForgeInvokedDirectReadTool,
  buildSafeReadResultSummary,
  demoGetIssueArgs,
  isComposioAuthFailure,
  p0DemoReadArguments,
  preflightExactReadDispatch,
  toRedactedReadEvidence,
} from "./index";

const ACTIVE_ACCOUNT = {
  id: "ca_test_account_nizY",
  status: "ACTIVE",
  isDisabled: false,
  toolkitSlug: "github",
};

describe("P0-305 real read preflight", () => {
  it("allows dispatch only for exact ACTIVE account and GITHUB_GET_AN_ISSUE", () => {
    const result = preflightExactReadDispatch({
      account: ACTIVE_ACCOUNT,
      expectedConnectedAccountId: ACTIVE_ACCOUNT.id,
      toolSlug: P0_COMPOSIO_READ_TOOL,
      connectorToolNames: [...P0_COMPOSIO_ENABLED_TOOLS],
      observedDescriptorHash: P0_COMPOSIO_DESCRIPTOR_HASHES.GITHUB_GET_AN_ISSUE,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.toolSlug).toBe("GITHUB_GET_AN_ISSUE");
    expect(result.accountSuffix).toBe("nizY");
    expect(result.connectorName).toBe("composio_github");
    expect(result.blocksDispatch).toBe(false);
  });

  it("maps expired auth to blocked_connection without fallback", () => {
    const result = preflightExactReadDispatch({
      account: { ...ACTIVE_ACCOUNT, status: "EXPIRED" },
      expectedConnectedAccountId: ACTIVE_ACCOUNT.id,
      toolSlug: P0_COMPOSIO_READ_TOOL,
      connectorToolNames: [...P0_COMPOSIO_ENABLED_TOOLS],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("expired_account");
    expect(result.runStepState).toBe("blocked_connection");
    expect(result.blocksDispatch).toBe(true);
  });

  it("rejects meta-tools and write tools for the read path", () => {
    const meta = preflightExactReadDispatch({
      account: ACTIVE_ACCOUNT,
      expectedConnectedAccountId: ACTIVE_ACCOUNT.id,
      toolSlug: P0_COMPOSIO_FORBIDDEN_SURFACES[1]!,
      connectorToolNames: [...P0_COMPOSIO_ENABLED_TOOLS],
    });
    expect(meta.ok).toBe(false);
    if (!meta.ok) {
      expect(meta.reason).toBe("meta_tool_rejected");
    }

    const write = preflightExactReadDispatch({
      account: ACTIVE_ACCOUNT,
      expectedConnectedAccountId: ACTIVE_ACCOUNT.id,
      toolSlug: "GITHUB_ADD_LABELS_TO_AN_ISSUE",
      connectorToolNames: [...P0_COMPOSIO_ENABLED_TOOLS],
    });
    expect(write.ok).toBe(false);
    if (!write.ok) {
      expect(write.reason).toBe("not_read_tool");
    }
  });

  it("rejects connector lists that expose forbidden meta surfaces", () => {
    const result = preflightExactReadDispatch({
      account: ACTIVE_ACCOUNT,
      expectedConnectedAccountId: ACTIVE_ACCOUNT.id,
      toolSlug: P0_COMPOSIO_READ_TOOL,
      connectorToolNames: [...P0_COMPOSIO_ENABLED_TOOLS, "COMPOSIO_MULTI_EXECUTE_TOOL"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("meta_tool_rejected");
    }
  });

  it("rejects missing observed descriptor hash fail-closed", () => {
    const result = preflightExactReadDispatch({
      account: ACTIVE_ACCOUNT,
      expectedConnectedAccountId: ACTIVE_ACCOUNT.id,
      toolSlug: P0_COMPOSIO_READ_TOOL,
      connectorToolNames: [...P0_COMPOSIO_ENABLED_TOOLS],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("descriptor_hash_missing");
    }
  });
});

describe("P0-305 safe read summary and redaction", () => {
  it("builds attributed summary without raw body or credentials", () => {
    const raw = {
      successful: true,
      data: {
        title: "Demo",
        body: "RAW ISSUE BODY SHOULD NOT LEAK",
        access_token: "secret-token",
        labels: [{ name: "forgeroom-p0-probe" }],
      },
      api_key: "composio-secret",
    };
    const summary = buildSafeReadResultSummary({
      coworkerId: "cw_operator",
      accountSuffix: "nizY",
      arguments: {
        ...demoGetIssueArgs(),
        authorization: "Bearer leak",
      },
      rawResult: raw,
    });

    expect(summary.coworkerId).toBe("cw_operator");
    expect(summary.toolName).toBe("GITHUB_GET_AN_ISSUE");
    expect(summary.target.display).toBe("pramodthe/ForgeRoom#35");
    expect(summary.redactedArguments).toMatchObject({
      owner: "pramodthe",
      repo: "ForgeRoom",
      issue_number: 35,
      authorization: "[REDACTED]",
    });
    expect(summary.resultSummary).toMatch(/Verified read|Safe read/i);
    expect(summary.rawResultObserved).toBe(true);
    expect(summary.rawResultByteLength).toBeGreaterThan(0);

    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("RAW ISSUE BODY");
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("composio-secret");
    expect(serialized).not.toContain("Bearer leak");
    // Summary object must not embed the raw provider payload.
    expect(summary).not.toHaveProperty("raw");
    expect(summary).not.toHaveProperty("rawResult");
    expect(summary).not.toHaveProperty("data");

    const evidence = toRedactedReadEvidence(summary);
    expect(evidence.rawResultBodyPresent).toBe(false);
    expect(evidence.credentialsPresent).toBe(false);
    expect(JSON.stringify(evidence)).not.toContain("secret-token");
  });

  it("asserts TrueForge must invoke the direct read tool", () => {
    expect(() => assertTrueForgeInvokedDirectReadTool("GITHUB_GET_AN_ISSUE")).not.toThrow();
    expect(() => assertTrueForgeInvokedDirectReadTool("COMPOSIO_MULTI_EXECUTE_TOOL")).toThrow(
      /meta-tool|direct/i,
    );
    expect(() => assertTrueForgeInvokedDirectReadTool("GITHUB_ADD_LABELS_TO_AN_ISSUE")).toThrow(
      /expected direct read/i,
    );
  });

  it("detects auth failures for blocked_connection mapping", () => {
    expect(isComposioAuthFailure({ error: { message: "token expired" } }, 401)).toBe(true);
    expect(isComposioAuthFailure({ successful: true, data: {} }, 200)).toBe(false);
  });

  it("exposes demo read arguments matching the synthetic fixture", () => {
    expect(p0DemoReadArguments()).toEqual({
      owner: "pramodthe",
      repo: "ForgeRoom",
      issue_number: 35,
    });
  });
});
