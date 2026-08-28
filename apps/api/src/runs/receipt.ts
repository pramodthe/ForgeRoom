import { createHash } from "node:crypto";
import type { AuditReceipt, SessionResponse } from "@forgeroom/contracts";
import {
  auditReceiptBodyHash,
  buildAuditReceipt,
  canonicalizeJson,
  type RunReceiptApprovalLink,
  type RunReceiptSnapshot,
} from "@forgeroom/domain";
import type { createSql } from "@forgeroom/db";
import { randomOpaqueId } from "../auth/crypto";
import type { AuditEventRecord, WorkspaceCatalogStore } from "../workspace/store";
import type { WorkspaceServiceResult } from "../workspace/service";

type SqlClient = ReturnType<typeof createSql>;

function classifyReceiptClaim(
  providerReceipt: unknown,
  state: string,
): RunReceiptApprovalLink["receipt_claim"] {
  if (
    providerReceipt &&
    typeof providerReceipt === "object" &&
    (providerReceipt as { kind?: string }).kind === "verified_provider_receipt"
  ) {
    return "verified_provider_receipt";
  }
  if (state === "succeeded" || state === "reconciled_succeeded") {
    return "labeled_safe_result";
  }
  return "none";
}

function hashProviderReceipt(providerReceipt: unknown): string | null {
  if (!providerReceipt || typeof providerReceipt !== "object") {
    return null;
  }
  const kind = (providerReceipt as { kind?: string }).kind;
  if (kind !== "verified_provider_receipt") {
    return null;
  }
  return `sha256:${createHash("sha256").update(canonicalizeJson(providerReceipt)).digest("hex")}`;
}

export async function loadRunReceiptSnapshot(
  sql: SqlClient,
  runId: string,
): Promise<RunReceiptSnapshot | null> {
  const runs = await sql<
    {
      id: string;
      channel_id: string;
      workspace_id: string;
      source_message_id: string;
    }[]
  >`
    SELECT r.id, r.channel_id, c.workspace_id, r.source_message_id
    FROM runs AS r
    JOIN channels AS c ON c.id = r.channel_id
    WHERE r.id = ${runId}
    LIMIT 1
  `;
  const run = runs[0];
  if (!run) {
    return null;
  }

  const steps = await sql<{ assigned_agent_id: string }[]>`
    SELECT assigned_agent_id FROM run_steps WHERE run_id = ${runId}
  `;
  const coworkerIds = [...new Set(steps.map((row) => row.assigned_agent_id))];

  const tasks = await sql<{ id: string }[]>`
    SELECT id FROM tasks WHERE source_run_id = ${runId} ORDER BY created_at DESC LIMIT 1
  `;
  const artifacts = await sql<{ id: string }[]>`
    SELECT id FROM artifacts WHERE run_id = ${runId} ORDER BY created_at DESC LIMIT 1
  `;
  const uiInstances = await sql<{ id: string; current_render_revision: number | null }[]>`
    SELECT id, current_render_revision
    FROM ui_instances
    WHERE run_id = ${runId}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const skillVersions = await sql<{ id: string }[]>`
    SELECT id FROM skill_versions WHERE source_run_id = ${runId} ORDER BY created_at DESC LIMIT 1
  `;
  const proposals = await sql<
    {
      id: string;
      state: string;
      tool_name: string;
      provider_receipt_json: unknown;
    }[]
  >`
    SELECT id, state, tool_name, provider_receipt_json
    FROM action_proposals
    WHERE run_id = ${runId}
    ORDER BY id
  `;

  const uiSurfaceHashes: Record<string, string> = {};
  const ui = uiInstances[0];
  if (ui?.current_render_revision != null) {
    uiSurfaceHashes[`ui_instance:${ui.id}:render_revision`] = `sha256:${createHash("sha256")
      .update(String(ui.current_render_revision))
      .digest("hex")}`;
  }

  const approvals: RunReceiptApprovalLink[] = proposals.map((row) => ({
    id: row.id,
    state: row.state,
    tool_name: row.tool_name,
    receipt_claim: classifyReceiptClaim(row.provider_receipt_json, row.state),
    provider_receipt_hash: hashProviderReceipt(row.provider_receipt_json),
  }));

  return {
    run_id: run.id,
    channel_id: run.channel_id,
    workspace_id: run.workspace_id,
    source_message_id: run.source_message_id,
    coworker_ids: coworkerIds,
    task_id: tasks[0]?.id ?? null,
    ui_instance_id: ui?.id ?? null,
    artifact_id: artifacts[0]?.id ?? null,
    skill_version_id: skillVersions[0]?.id ?? null,
    approval_ids: proposals.map((row) => row.id),
    approvals,
    ui_surface_hashes: uiSurfaceHashes,
    created_at: new Date().toISOString(),
  };
}

export async function getRunReceiptForSession(
  deps: {
    store: WorkspaceCatalogStore;
    sql?: SqlClient;
    now: () => Date;
  },
  session: SessionResponse,
  runId: string,
): Promise<
  WorkspaceServiceResult<{
    receipt: AuditReceipt;
    receipt_hash: string;
    disclaimer: string;
  }>
> {
  if (!deps.sql) {
    return {
      ok: false,
      error: { code: "not_found", message: "Run receipt is unavailable without database backing." },
    };
  }

  const snapshot = await loadRunReceiptSnapshot(deps.sql, runId);
  if (!snapshot || snapshot.workspace_id !== session.workspace_id) {
    return { ok: false, error: { code: "not_found", message: "Run not found." } };
  }

  const receipt = buildAuditReceipt(snapshot);
  const receiptHash = auditReceiptBodyHash(receipt);

  const audit: AuditEventRecord = {
    id: randomOpaqueId("aud"),
    workspaceId: snapshot.workspace_id,
    channelId: snapshot.channel_id,
    actorType: "human",
    actorId: session.user.id,
    action: "run.receipt_viewed",
    targetType: "run",
    targetId: runId,
    redactedPayloadJson: {
      receipt_hash: receiptHash,
      approval_count: receipt.approval_ids.length,
    },
    payloadHash: receiptHash,
    createdAt: deps.now().toISOString(),
  };
  await deps.store.appendAuditEvent(audit);

  return {
    ok: true,
    value: {
      receipt,
      receipt_hash: receiptHash,
      disclaimer:
        "Application history with declared lineage. This is not cryptographic tamper evidence.",
    },
  };
}
