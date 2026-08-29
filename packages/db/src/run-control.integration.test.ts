import { describe, expect, it } from "vitest";
import {
  enqueueCorrectionForStep,
  markActiveTurnsNeedsAttentionOnRestart,
  requestRunStepStop,
  settleCancelledStep,
} from "./run-control";
import { claimTurnQueueItem, enqueueTurnQueueItem } from "./turn-queue";
import { HASH, NOW, seedRuntime, withMigratedDatabase } from "./test-harness";

async function seedWaitingInterrupt(sql: Parameters<typeof seedRuntime>[0]) {
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO ui_surface_grants (
        id, ui_instance_id, grant_kind, policy_revision, bound_render_revision,
        bound_manifest_hash, action_ref, handler_key, action_mode, input_schema_json,
        input_schema_hash, allowed_render_node_ids_json, component_interrupt_id,
        grant_scope_hash, max_uses, use_count, issued_by, expires_at, created_at
      ) VALUES (
        'ag_stop_interrupt', 'ui_1', 'action', 1, 0, ${HASH}, 'submit',
        'controlled_ui.complete_component_interrupt.v1', 'complete_component_interrupt',
        '{}'::jsonb, ${HASH}, '["node_1"]'::jsonb, 'intr_stop',
        ${HASH}, 1, 0, 'application_policy', '2099-01-01T00:00:00.000Z', ${NOW}
      )
    `;
    await tx`
      INSERT INTO ui_component_interrupts (
        id, ui_instance_id, run_id, run_step_id, agent_turn_id, logical_thread_id,
        tool_call_id, session_generation_id, action_grant_id, input_schema_hash, state, created_at
      ) VALUES (
        'intr_stop', 'ui_1', 'run_1', 'step_1', 'turn_1', 'thread_1',
        'tc_stop_interrupt', 'gen_1', 'ag_stop_interrupt', ${HASH}, 'waiting', ${NOW}
      )
    `;
  });
  await sql`
    INSERT INTO ui_interactions (
      id, ui_instance_id, render_revision, action_grant_id, render_node_id,
      handler_key, intent_name, payload_redacted_json, payload_hash,
      interaction_token_hash, idempotency_key_hash, token_expires_at,
      actor_user_id, client_kind, state, created_at
    ) VALUES (
      'int_stop', 'ui_1', 0, 'ag_stop_interrupt', 'node_1',
      'controlled_ui.complete_component_interrupt.v1', 'submit', '{}'::jsonb, ${HASH},
      ${HASH}, 'idempotency-stop', '2099-01-01T00:00:00.000Z',
      'user_1', 'registry', 'token_issued', ${NOW}
    )
  `;
}

describe("run stop and correction", () => {
  it("stales UI interrupts and issued interactions on cancel/watchdog timeout", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await seedWaitingInterrupt(sql);

      const stopped = await requestRunStepStop(sql, { runStepId: "step_1", now: NOW });
      expect(stopped).toMatchObject({
        ok: true,
        decision: { action: "enter_cancelling", callCancel: true },
      });

      const interrupts = await sql<
        { state: string; stale_at: Date | null; stale_reason: string | null }[]
      >`
        SELECT state, stale_at, result_redacted_json->>'reason' AS stale_reason
        FROM ui_component_interrupts WHERE id = 'intr_stop'
      `;
      expect(interrupts[0]).toMatchObject({
        state: "stale",
        stale_at: expect.any(Date),
        stale_reason: "run_cancelling",
      });
      const grants = await sql<{ revoked_at: Date | null }[]>`
        SELECT revoked_at FROM ui_surface_grants WHERE id = 'ag_stop_interrupt'
      `;
      expect(grants[0]?.revoked_at).toBeInstanceOf(Date);
      const interactions = await sql<
        { state: string; consumed_at: Date | null; stale_reason: string | null }[]
      >`
        SELECT state, consumed_at, result_redacted_json->>'reason' AS stale_reason
        FROM ui_interactions WHERE id = 'int_stop'
      `;
      expect(interactions[0]).toMatchObject({
        state: "stale",
        consumed_at: expect.any(Date),
        stale_reason: "run_cancelling",
      });

      // The terminal settle path is an idempotent cleanup backstop.
      await settleCancelledStep(sql, { runStepId: "step_1", now: NOW });
      expect(
        await sql<{ state: string }[]>`
          SELECT state FROM ui_component_interrupts WHERE id = 'intr_stop'
        `,
      ).toEqual([{ state: "stale" }]);
    });
  }, 60_000);

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
