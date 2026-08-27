import { describe, expect, it } from "vitest";
import {
  enqueueCorrectionForStep,
  markActiveTurnsNeedsAttentionOnRestart,
  requestRunStepStop,
  settleCancelledStep,
} from "./run-control";
import { claimTurnQueueItem, enqueueTurnQueueItem } from "./turn-queue";
import { NOW, seedRuntime, withMigratedDatabase } from "./test-harness";

describe("run stop and correction", () => {
  it("stops once, blocks new claims while cancelling, and queues a linked correction", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);

      const first = await requestRunStepStop(sql, { runStepId: "step_1", now: NOW });
      expect(first.ok).toBe(true);
      if (!first.ok) throw new Error("stop");
      expect(first.decision.callCancel).toBe(true);

      const second = await requestRunStepStop(sql, { runStepId: "step_1", now: NOW });
      expect(second.ok).toBe(true);
      if (!second.ok) throw new Error("stop2");
      expect(second.decision.callCancel).toBe(false);

      await enqueueTurnQueueItem(sql, {
        id: "q_blocked",
        channelAgentSessionId: "cas_1",
        runStepId: "step_1",
        inputType: "normal",
      });
      // Seed turn is still linked to cancelling step_1 → claim blocked.
      expect(
        await claimTurnQueueItem(sql, {
          queueItemId: "q_blocked",
          workerId: "worker_1",
          leaseExpiresAt: "2099-01-01T00:00:00.000Z",
          now: NOW,
        }),
      ).toEqual({ ok: false, reason: "session_busy" });

      await settleCancelledStep(sql, { runStepId: "step_1", now: NOW });
      await sql`UPDATE agent_turns SET state = 'cancelled', completed_at = ${NOW} WHERE id = 'turn_1'`;

      const correction = await enqueueCorrectionForStep(sql, {
        channelAgentSessionId: "cas_1",
        priorRunStepId: "step_1",
        content: "Prefer the safe label",
        boundSessionGenerationId: "gen_1",
      });
      const queued = await sql<{ input_type: string; run_step_id: string }[]>`
        SELECT input_type, run_step_id FROM turn_queue_items WHERE id = ${correction.queueItemId}
      `;
      expect(queued[0]?.input_type).toBe("correction");
      const refs = await sql<{ context_refs_json: unknown }[]>`
        SELECT context_refs_json FROM run_steps WHERE id = ${correction.runStepId}
      `;
      expect(JSON.stringify(refs[0]?.context_refs_json)).toContain("step_1");
    });
  }, 60_000);

  it("marks active turns needs_attention on process restart without auto-retry", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const result = await markActiveTurnsNeedsAttentionOnRestart(sql, { now: NOW });
      expect(result.marked).toBe(1);
      const turn = await sql<{ state: string; error_json: Record<string, unknown> }[]>`
        SELECT state, error_json FROM agent_turns WHERE id = 'turn_1'
      `;
      expect(turn[0]?.state).toBe("uncertain");
      const errorJson =
        typeof turn[0]?.error_json === "string"
          ? JSON.parse(turn[0].error_json)
          : turn[0]?.error_json;
      expect(errorJson).toMatchObject({
        needs_attention: true,
        reason: "process_restart",
        auto_retry: false,
      });
    });
  }, 60_000);
});
