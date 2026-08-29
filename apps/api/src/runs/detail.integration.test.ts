import { describe, expect, it } from "vitest";
import { runDetailResponseSchema, runSchema } from "@forgeroom/contracts";
import { seedRuntime, withMigratedDatabase } from "@forgeroom/db/test-harness";
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

describe("run detail API", () => {
  it("returns normalized run projection with source message body", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const store = createPostgresWorkspaceStore(sql);
      const workspace = createWorkspaceService({ store, sql });

      const result = await workspace.getRun(SESSION, "run_1");
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const parsed = runDetailResponseSchema.parse(result.value);
      expect(runSchema.parse(parsed.run)).toEqual(parsed.run);
      expect(parsed.run.id).toBe("run_1");
      expect(parsed.run.lifecycle).toBe("active");
      expect(parsed.run.activity.running).toBe(1);
      expect(parsed.run.steps).toHaveLength(1);
      expect(parsed.run.steps[0]).toMatchObject({
        id: "step_1",
        assigned_coworker_id: "cw_1",
        logical_thread_id: "thread_1",
        objective: "Read",
        state: "running",
      });
      expect(parsed.source_message_body).toBe("Please inspect");
      expect(parsed.events).toEqual([]);
      expect(parsed.tasks).toEqual([]);
      expect(parsed.artifacts).toEqual([]);
      expect(parsed.decisions).toEqual([]);
    });
  }, 60_000);

  it("cancels remaining stoppable steps on the run", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const store = createPostgresWorkspaceStore(sql);
      const workspace = createWorkspaceService({ store, sql });

      const result = await workspace.cancelRun(SESSION, "run_1", {
        schemaVersion: 1,
        expected_lifecycle: "active",
        reason: "Owner requested stop",
        idempotency_key: "idem_cancel_run_1",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.cancelled_step_ids).toEqual(["step_1"]);

      const step = await sql<{ state: string }[]>`
        SELECT state FROM run_steps WHERE id = 'step_1'
      `;
      expect(step[0]?.state).toBe("cancelling");
    });
  }, 60_000);

  it("rejects cross-workspace run access", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const store = createPostgresWorkspaceStore(sql);
      const workspace = createWorkspaceService({ store, sql });

      const result = await workspace.getRun({ ...SESSION, workspace_id: "ws_other" }, "run_1");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("not_found");
    });
  }, 60_000);
});
