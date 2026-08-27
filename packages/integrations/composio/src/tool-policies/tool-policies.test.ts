import { describe, expect, it } from "vitest";
import { P0_COMPOSIO_DESCRIPTOR_HASHES } from "../descriptors";
import { P0_COMPOSIO_DIRECT_TOOLS } from "../p0-contract";
import {
  P0_DEMO_GITHUB_ISSUE,
  P0_TOOL_POLICIES,
  assertToolPolicyCoverage,
  assertWriteToolAllowed,
  demoAddProbeLabelArgs,
  demoGetIssueArgs,
  demoRemoveProbeLabelArgs,
  describeToolPolicyBoundary,
  evaluateReconciliation,
  getToolPolicy,
  isSensitiveArgumentKey,
  listToolPolicies,
  requireToolPolicy,
  ToolPolicyError,
} from "./index";

describe("P0 ToolPolicyDefinition coverage", () => {
  it("registers a policy for every exact enabled tool and descriptor hash", () => {
    assertToolPolicyCoverage();
    expect(listToolPolicies()).toHaveLength(P0_COMPOSIO_DIRECT_TOOLS.length);
    for (const tool of P0_COMPOSIO_DIRECT_TOOLS) {
      const policy = requireToolPolicy(tool);
      expect(policy.observedDescriptorHash).toBe(P0_COMPOSIO_DESCRIPTOR_HASHES[tool]);
      expect(P0_TOOL_POLICIES[tool]).toBe(policy);
    }
    const boundary = describeToolPolicyBoundary();
    expect(boundary.ownerTask).toBe("P0-303");
    expect(boundary.policyCount).toBe(3);
    expect(boundary.unknownWrites).toBe("blocked");
    expect([...boundary.tools].sort()).toEqual([...P0_COMPOSIO_DIRECT_TOOLS].sort());
  });
});

describe("target extraction and argument redaction", () => {
  it("extracts SafeTargetSummary and redacts sensitive adversarial fields", () => {
    const policy = requireToolPolicy("GITHUB_ADD_LABELS_TO_AN_ISSUE");
    const args = {
      ...demoAddProbeLabelArgs(),
      api_key: "sk-live-should-not-leak",
      authorization: "Bearer leak",
      nested_token: "still-sensitive-suffix",
      labels: [P0_DEMO_GITHUB_ISSUE.syntheticLabel, "zzz-extra"],
    };

    const target = policy.extractTarget(args);
    expect(target).toEqual({
      kind: "github_issue",
      owner: "pramodthe",
      repo: "ForgeRoom",
      issueNumber: 35,
      display: "pramodthe/ForgeRoom#35",
    });

    const redacted = policy.redactArguments(args);
    expect(redacted.api_key).toBe("[REDACTED]");
    expect(redacted.authorization).toBe("[REDACTED]");
    expect(redacted.nested_token).toBe("[REDACTED]");
    expect(redacted.owner).toBe("pramodthe");
    expect(redacted.repo).toBe("ForgeRoom");
    expect(redacted.issue_number).toBe(35);
    expect(redacted.labels).toEqual(["forgeroom-p0-probe", "zzz-extra"]);
    expect(JSON.stringify(redacted)).not.toContain("sk-live");
    expect(JSON.stringify(redacted)).not.toContain("Bearer leak");
    expect(isSensitiveArgumentKey("Composio_Api_Key")).toBe(true);
  });

  it("rejects invalid targets", () => {
    const policy = requireToolPolicy("GITHUB_GET_AN_ISSUE");
    expect(() => policy.extractTarget({ owner: "a", repo: "b" })).toThrow(ToolPolicyError);
    expect(() => policy.extractTarget(null)).toThrow(ToolPolicyError);
  });
});

describe("deterministic write preview", () => {
  it("renders stable expectedEffect for identical args", () => {
    const policy = requireToolPolicy("GITHUB_ADD_LABELS_TO_AN_ISSUE");
    const args = {
      labels: ["b-label", "a-label"],
      issue_number: 35,
      repo: "ForgeRoom",
      owner: "pramodthe",
    };
    const first = policy.renderPreview(args);
    const second = policy.renderPreview({
      owner: "pramodthe",
      repo: "ForgeRoom",
      issue_number: "35",
      labels: ["a-label", "b-label"],
    });

    expect(first.expectedEffect).toBe(
      "Add label(s) [a-label, b-label] to GitHub issue pramodthe/ForgeRoom#35",
    );
    expect(second.expectedEffect).toBe(first.expectedEffect);
    expect(first.redactedArguments).toEqual(second.redactedArguments);
    expect(first.riskClass).toBe("write");
    expect(first.dataLeavingWorkspace).toContain("pramodthe/ForgeRoom#35");
  });

  it("renders read and remove previews deterministically", () => {
    const read = requireToolPolicy("GITHUB_GET_AN_ISSUE").renderPreview(demoGetIssueArgs());
    expect(read.expectedEffect).toBe("Read GitHub issue pramodthe/ForgeRoom#35");
    expect(read.riskClass).toBe("read");

    const remove = requireToolPolicy("GITHUB_REMOVE_A_LABEL_FROM_AN_ISSUE").renderPreview(
      demoRemoveProbeLabelArgs(),
    );
    expect(remove.expectedEffect).toBe(
      "Remove label [forgeroom-p0-probe] from GitHub issue pramodthe/ForgeRoom#35",
    );
  });
});

describe("idempotency classification", () => {
  it("uses verified | not-idempotent | unknown only — never assumed absent", () => {
    const allowed = new Set(["verified", "not-idempotent", "unknown"]);
    for (const policy of listToolPolicies()) {
      expect(allowed.has(policy.idempotency)).toBe(true);
    }
    expect(requireToolPolicy("GITHUB_ADD_LABELS_TO_AN_ISSUE").idempotency).toBe("verified");
    expect(requireToolPolicy("GITHUB_REMOVE_A_LABEL_FROM_AN_ISSUE").idempotency).toBe("verified");
    expect(requireToolPolicy("GITHUB_GET_AN_ISSUE").idempotency).toBe("verified");
  });
});

describe("demo write reconciliation and receipt", () => {
  it("builds reconciliation query and verifies receipts for the demo write", () => {
    const policy = assertWriteToolAllowed("GITHUB_ADD_LABELS_TO_AN_ISSUE");
    const args = demoAddProbeLabelArgs();
    const preview = policy.renderPreview(args);
    const query = policy.reconcile!({
      toolName: policy.toolName,
      redactedArguments: preview.redactedArguments,
      redactedTarget: preview.target,
      expectedEffect: preview.expectedEffect,
    });

    expect(query).toEqual({
      toolName: "GITHUB_GET_AN_ISSUE",
      arguments: {
        owner: "pramodthe",
        repo: "ForgeRoom",
        issue_number: 35,
      },
      expect: {
        kind: "label_present",
        label: "forgeroom-p0-probe",
      },
    });

    expect(
      evaluateReconciliation(query, {
        successful: true,
        data: { labels: [{ name: "forgeroom-p0-probe" }, { name: "bug" }] },
      }).matched,
    ).toBe(true);
    expect(
      evaluateReconciliation(query, {
        successful: true,
        data: { labels: [{ name: "bug" }] },
      }).matched,
    ).toBe(false);

    const receipt = policy.verifyReceipt!({ successful: true, data: { ok: true } }, args);
    expect(receipt).toEqual({
      kind: "verified_provider_receipt",
      toolName: "GITHUB_ADD_LABELS_TO_AN_ISSUE",
      target: preview.target,
      outcome: "succeeded",
      summary: "Verified label add on GitHub issue pramodthe/ForgeRoom#35",
    });

    const unlabeled = requireToolPolicy("GITHUB_GET_AN_ISSUE").verifyReceipt!(
      { data: { title: "demo" } },
      demoGetIssueArgs(),
    );
    expect(unlabeled?.kind).toBe("labeled_safe_result");
  });

  it("reconciles remove as label_absent", () => {
    const policy = assertWriteToolAllowed("GITHUB_REMOVE_A_LABEL_FROM_AN_ISSUE");
    const preview = policy.renderPreview(demoRemoveProbeLabelArgs());
    const query = policy.reconcile!({
      toolName: policy.toolName,
      redactedArguments: preview.redactedArguments,
      redactedTarget: preview.target,
      expectedEffect: preview.expectedEffect,
    });
    expect(query.expect).toEqual({ kind: "label_absent", label: "forgeroom-p0-probe" });
    expect(evaluateReconciliation(query, { data: { labels: [] } }).matched).toBe(true);
  });
});

describe("unknown writes are blocked", () => {
  it("blocks unknown and non-writable tools", () => {
    expect(getToolPolicy("GITHUB_CREATE_ISSUE")).toBeNull();
    expect(() => assertWriteToolAllowed("GITHUB_CREATE_ISSUE")).toThrow(ToolPolicyError);
    expect(() => assertWriteToolAllowed("GITHUB_CREATE_ISSUE")).toThrow(/unknown write blocked/i);
    expect(() => assertWriteToolAllowed("GITHUB_GET_AN_ISSUE")).toThrow(/read tool/i);
    expect(() => requireToolPolicy("NOT_A_TOOL")).toThrow(ToolPolicyError);
  });
});
