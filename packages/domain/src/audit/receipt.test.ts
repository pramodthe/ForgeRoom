import { describe, expect, it } from "vitest";
import { auditReceiptSchema } from "@forgeroom/contracts";
import { auditReceiptBodyHash, buildAuditReceipt, type RunReceiptSnapshot } from "./receipt";

const BASE: RunReceiptSnapshot = {
  run_id: "run_demo",
  channel_id: "ch_general",
  workspace_id: "workspace_1",
  source_message_id: "msg_source",
  coworker_ids: ["cw_operator", "cw_research"],
  task_id: "task_demo",
  ui_instance_id: "uiinst_table",
  artifact_id: "artifact_daytona",
  skill_version_id: null,
  approval_ids: ["ap_write"],
  approvals: [
    {
      id: "ap_write",
      state: "reconciled_succeeded",
      tool_name: "GITHUB_ADD_LABELS_TO_AN_ISSUE",
      receipt_claim: "verified_provider_receipt",
      provider_receipt_hash: `sha256:${"ab".repeat(32)}`,
    },
  ],
  ui_surface_hashes: {
    "ui_instance:uiinst_table:render_revision": `sha256:${"cd".repeat(32)}`,
  },
  created_at: "2026-08-28T19:00:00.000Z",
};

describe("audit receipt", () => {
  it("builds a closed receipt with declared lineage and labeled provider claim", () => {
    const receipt = buildAuditReceipt(BASE);
    expect(auditReceiptSchema.parse(receipt)).toEqual(receipt);
    expect(receipt.lineage).toMatchObject({
      kind: "application_history",
      declared_source_message_id: "msg_source",
    });
    expect(receipt.approval_ids).toEqual(["ap_write"]);
    expect(receipt.hashes.lineage).toMatch(/^sha256:/);
    expect(auditReceiptBodyHash(receipt)).toMatch(/^sha256:/);
  });

  it("labels generic tool results without verified provider receipt hash", () => {
    const receipt = buildAuditReceipt({
      ...BASE,
      approvals: [
        {
          id: "ap_read",
          state: "succeeded",
          tool_name: "GITHUB_GET_AN_ISSUE",
          receipt_claim: "labeled_safe_result",
          provider_receipt_hash: null,
        },
      ],
      approval_ids: ["ap_read"],
    });
    const parsed = receipt.lineage as { approvals: Array<{ receipt_claim: string }> };
    expect(parsed.approvals[0]?.receipt_claim).toBe("labeled_safe_result");
    expect(receipt.hashes["approval:ap_read:provider_receipt"]).toBeUndefined();
  });

  it("never embeds raw provider bodies in lineage", () => {
    const receipt = buildAuditReceipt(BASE);
    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toMatch(/password|api_key|access_token/i);
    expect(serialized).not.toContain("oauth");
  });
});
