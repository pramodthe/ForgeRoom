import { createHash } from "node:crypto";
import type { AuditReceipt } from "@forgeroom/contracts";
import { auditReceiptSchema } from "@forgeroom/contracts";
import { canonicalizeJson } from "../components/jcs";

export type RunReceiptApprovalLink = {
  id: string;
  state: string;
  tool_name: string;
  receipt_claim: "verified_provider_receipt" | "labeled_safe_result" | "none";
  provider_receipt_hash: string | null;
};

export type RunReceiptSnapshot = {
  run_id: string;
  channel_id: string;
  workspace_id: string;
  source_message_id: string;
  coworker_ids: string[];
  task_id: string | null;
  ui_instance_id: string | null;
  artifact_id: string | null;
  skill_version_id: string | null;
  approval_ids: string[];
  approvals: RunReceiptApprovalLink[];
  ui_surface_hashes: Record<string, string>;
  created_at: string;
};

function hashJson(value: unknown): string {
  const digest = createHash("sha256").update(canonicalizeJson(value)).digest("hex");
  return `sha256:${digest}`;
}

/** Build a safe, redacted application audit receipt — declared lineage, not provider proof. */
export function buildAuditReceipt(snapshot: RunReceiptSnapshot): AuditReceipt {
  const lineage = {
    kind: "application_history" as const,
    declared_source_message_id: snapshot.source_message_id,
    coworker_ids: [...snapshot.coworker_ids],
    task_id: snapshot.task_id,
    ui_instance_id: snapshot.ui_instance_id,
    artifact_id: snapshot.artifact_id,
    skill_version_id: snapshot.skill_version_id,
    approvals: snapshot.approvals.map((row) => ({
      id: row.id,
      state: row.state,
      tool_name: row.tool_name,
      receipt_claim: row.receipt_claim,
      ...(row.provider_receipt_hash ? { provider_receipt_hash: row.provider_receipt_hash } : {}),
    })),
    note:
      "Application history with declared lineage. Generic tool responses are labeled; only adapter-verified receipts are named as provider proof.",
  };

  const hashes: Record<string, string> = {
    lineage: hashJson(lineage),
    ...snapshot.ui_surface_hashes,
  };

  for (const approval of snapshot.approvals) {
    if (approval.provider_receipt_hash) {
      hashes[`approval:${approval.id}:provider_receipt`] = approval.provider_receipt_hash;
    }
  }

  return auditReceiptSchema.parse({
    schemaVersion: 1,
    run_id: snapshot.run_id,
    channel_id: snapshot.channel_id,
    source_message_id: snapshot.source_message_id,
    coworker_ids: snapshot.coworker_ids,
    task_id: snapshot.task_id,
    ui_instance_id: snapshot.ui_instance_id,
    artifact_id: snapshot.artifact_id,
    skill_version_id: snapshot.skill_version_id,
    approval_ids: snapshot.approval_ids,
    hashes,
    lineage,
    created_at: snapshot.created_at,
  });
}

export function auditReceiptBodyHash(receipt: AuditReceipt): string {
  return hashJson(receipt);
}
