import { describe, expect, it } from "vitest";
import { auditReceiptSchema } from "@forgeroom/contracts";
import { HASH, NOW, seedRuntime, withMigratedDatabase } from "@forgeroom/db/test-harness";
import type { SessionResponse } from "@forgeroom/contracts";
import { createPostgresWorkspaceStore } from "../workspace/postgres-store";
import { createWorkspaceService } from "../workspace/service";

const SESSION: SessionResponse = {
  request_id: "req_test",
  user: { id: "user_1", email: "owner@example.test", display_name: "Owner", role: "owner" },
  workspace_id: "ws_1",
  csrf_token: "csrf_test",
  expires_at: "2026-08-29T00:00:00.000Z",
};

async function seedReceiptLineage(sql: Parameters<typeof seedRuntime>[0]) {
  await sql`
    INSERT INTO tasks (
      id, workspace_id, channel_id, title, description, status, assignee_type, assignee_id,
      source_message_id, source_run_id, current_revision, created_by_type, created_by_id,
      created_at, updated_at
    )
    VALUES (
      'task_1', 'ws_1', 'ch_1', 'Inspect fixture', NULL, 'todo', 'coworker', 'cw_1',
      'msg_1', 'run_1', 1, 'human', 'user_1', ${NOW}, ${NOW}
    )
  `;
  await sql`
    INSERT INTO artifacts (
      id, workspace_id, channel_id, run_id, run_step_id, creator_agent_id, kind, name,
      mime_type, storage_key, byte_size, sha256, revision, created_at
    )
    VALUES (
      'art_1', 'ws_1', 'ch_1', 'run_1', 'step_1', 'cw_1', 'file', 'report.txt',
      'text/plain', 'storage/art_1', 12, ${HASH}, 1, ${NOW}
    )
  `;
  await sql`
    UPDATE ui_instances
    SET status = 'ready', current_render_revision = 1, last_good_render_revision = 1
    WHERE id = 'ui_1'
  `;
}

describe("run audit receipt postgres integration", () => {
  it.skipIf(!process.env.DATABASE_URL)(
    "returns declared lineage and appends actor-attributed audit events",
    async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await seedReceiptLineage(sql);
      const store = createPostgresWorkspaceStore(sql);
      const workspace = createWorkspaceService({ store, sql, now: () => new Date(NOW) });

      const before = await store.listAuditEvents("ws_1", "run_1");
      expect(before).toHaveLength(0);

      const result = await workspace.getRunReceipt(SESSION, "run_1");
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.disclaimer).toContain("Application history");
      expect(auditReceiptSchema.parse(result.value.receipt)).toEqual(result.value.receipt);
      expect(result.value.receipt).toMatchObject({
        run_id: "run_1",
        channel_id: "ch_1",
        source_message_id: "msg_1",
        coworker_ids: ["cw_1"],
        task_id: "task_1",
        ui_instance_id: "ui_1",
        artifact_id: "art_1",
      });
      expect(result.value.receipt_hash).toMatch(/^sha256:/);
      expect(JSON.stringify(result.value.receipt)).not.toMatch(/password|api_key|access_token/i);

      const after = await store.listAuditEvents("ws_1", "run_1");
      expect(after).toHaveLength(1);
      expect(after[0]).toMatchObject({
        actorType: "human",
        actorId: "user_1",
        action: "run.receipt_viewed",
        targetType: "run",
        targetId: "run_1",
      });

      const replay = await workspace.getRunReceipt(SESSION, "run_1");
      expect(replay.ok).toBe(true);
      const events = await store.listAuditEvents("ws_1", "run_1");
      expect(events).toHaveLength(2);
    });
  });

  it.skipIf(!process.env.DATABASE_URL)("rejects cross-workspace receipt access", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const store = createPostgresWorkspaceStore(sql);
      const workspace = createWorkspaceService({ store, sql });

      const result = await workspace.getRunReceipt(
        { ...SESSION, workspace_id: "ws_other" },
        "run_1",
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("not_found");
    });
  });
});
