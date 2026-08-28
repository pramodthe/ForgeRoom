import { describe, expect, it } from "vitest";
import { materializeTaskGrantFromOperations } from "@forgeroom/domain";
import { seedRuntime, withMigratedDatabase } from "@forgeroom/db/test-harness";
import { createPostgresWorkspaceStore } from "./postgres-store";
import { createWorkspaceService } from "./service";

async function seedCoworkerParticipant(sql: Parameters<typeof seedRuntime>[0]) {
  await sql`
    INSERT INTO channel_participants (
      channel_id, participant_type, participant_id, role, joined_at
    ) VALUES ('ch_1', 'coworker', 'cw_1', 'member', now())
  `;
}

async function seedTaskGrant(sql: Parameters<typeof seedRuntime>[0]) {
  const material = materializeTaskGrantFromOperations(["create", "update_status"]);
  await sql`
    INSERT INTO task_grants (
      id, task_id, channel_id, subject_type, subject_id,
      allowed_operations_json, allowed_fields_json, allowed_transitions_json,
      policy_revision, granted_by, created_at
    )
    VALUES (
      'tgrant_1', NULL, 'ch_1', 'coworker', 'cw_1',
      ${JSON.stringify(material.allowedOperations)}::jsonb,
      ${JSON.stringify(material.allowedFields)}::jsonb,
      ${JSON.stringify(material.allowedTransitions)}::jsonb,
      1, 'user_1', now()
    )
  `;
}

describe("TaskRecord postgres integration", () => {
  it("serializes concurrent task updates with one stale revision winner", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await seedCoworkerParticipant(sql);
      await seedTaskGrant(sql);
      const store = createPostgresWorkspaceStore(sql);
      const workspace = createWorkspaceService({ store, sql });
      const created = await workspace.createTaskForCoworker("cw_1", "ch_1", {
        schemaVersion: 1,
        title: "Concurrent task",
        description: null,
        status: "todo",
        assignee_type: "coworker",
        assignee_id: "cw_1",
        source_message_id: null,
        source_run_id: "run_1",
        due_at: null,
        idempotency_key: "idem_task_concurrent_create",
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const [winner, loser] = await Promise.all([
        workspace.updateTaskForCoworker("cw_1", created.value.id, {
          schemaVersion: 1,
          expected_revision: 1,
          status: "in_progress",
          idempotency_key: "idem_task_concurrent_a",
        }),
        workspace.updateTaskForCoworker("cw_1", created.value.id, {
          schemaVersion: 1,
          expected_revision: 1,
          status: "blocked",
          idempotency_key: "idem_task_concurrent_b",
        }),
      ]);

      const results = [winner, loser];
      const successes = results.filter((result) => result.ok);
      const stale = results.filter(
        (result) => !result.ok && result.error.code === "stale_task_revision",
      );
      expect(successes).toHaveLength(1);
      expect(stale).toHaveLength(1);

      const revisions = await sql<{ revision: number }[]>`
        SELECT revision FROM task_revisions
        WHERE task_id = ${created.value.id}
        ORDER BY revision ASC
      `;
      expect(revisions.map((row) => row.revision)).toEqual([1, 2]);
    });
  }, 60_000);

  it("replays idempotent coworker task commands once", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await seedCoworkerParticipant(sql);
      await seedTaskGrant(sql);
      const workspace = createWorkspaceService({
        store: createPostgresWorkspaceStore(sql),
        sql,
      });

      const first = await workspace.createTaskForCoworker("cw_1", "ch_1", {
        schemaVersion: 1,
        title: "Idempotent task",
        description: null,
        status: "todo",
        assignee_type: "coworker",
        assignee_id: "cw_1",
        source_message_id: null,
        source_run_id: "run_1",
        due_at: null,
        idempotency_key: "idem_task_coworker_create",
      });
      const replay = await workspace.createTaskForCoworker("cw_1", "ch_1", {
        schemaVersion: 1,
        title: "Idempotent task",
        description: null,
        status: "todo",
        assignee_type: "coworker",
        assignee_id: "cw_1",
        source_message_id: null,
        source_run_id: "run_1",
        due_at: null,
        idempotency_key: "idem_task_coworker_create",
      });
      expect(first.ok).toBe(true);
      expect(replay.ok).toBe(true);
      if (!first.ok || !replay.ok) return;
      expect(replay.value.id).toBe(first.value.id);

      const firstUpdate = await workspace.updateTaskForCoworker("cw_1", first.value.id, {
        schemaVersion: 1,
        expected_revision: 1,
        status: "in_progress",
        idempotency_key: "idem_task_coworker_update",
      });
      const updateReplay = await workspace.updateTaskForCoworker("cw_1", first.value.id, {
        schemaVersion: 1,
        expected_revision: 1,
        status: "in_progress",
        idempotency_key: "idem_task_coworker_update",
      });
      expect(firstUpdate.ok).toBe(true);
      expect(updateReplay.ok).toBe(true);
      if (!firstUpdate.ok || !updateReplay.ok) return;
      expect(updateReplay.value).toEqual(firstUpdate.value);
      expect(updateReplay.value.current_revision).toBe(2);

      const rows = await sql<{ count: string }[]>`
        SELECT COUNT(*)::text AS count FROM tasks WHERE channel_id = 'ch_1'
      `;
      expect(Number(rows[0]?.count ?? 0)).toBe(1);
    });
  }, 60_000);
});
