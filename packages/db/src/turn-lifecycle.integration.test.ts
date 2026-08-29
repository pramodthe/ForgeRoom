import { describe, expect, it } from "vitest";
import {
  bindTrueForgeTurnId,
  ingestNormalizedTrueForgeEvent,
  lockAgentTurnForCreate,
} from "./turn-lifecycle";
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
        'ag_failure_interrupt', 'ui_1', 'action', 1, 0, ${HASH}, 'submit',
        'controlled_ui.complete_component_interrupt.v1', 'complete_component_interrupt',
        '{}'::jsonb, ${HASH}, '["node_1"]'::jsonb, 'intr_failure',
        ${HASH}, 1, 0, 'application_policy', '2099-01-01T00:00:00.000Z', ${NOW}
      )
    `;
    await tx`
      INSERT INTO ui_component_interrupts (
        id, ui_instance_id, run_id, run_step_id, agent_turn_id, logical_thread_id,
        tool_call_id, session_generation_id, action_grant_id, input_schema_hash, state, created_at
      ) VALUES (
        'intr_failure', 'ui_1', 'run_1', 'step_1', 'turn_1', 'thread_1',
        'tc_failure_interrupt', 'gen_1', 'ag_failure_interrupt', ${HASH}, 'waiting', ${NOW}
      )
    `;
  });
}

async function clearSeedTurn(sql: Parameters<typeof seedRuntime>[0]) {
  await sql`UPDATE agent_turns SET state = 'completed', completed_at = ${NOW} WHERE id = 'turn_1'`;
  await sql`
    UPDATE turn_queue_items
    SET state = 'completed', completed_at = ${NOW}, lease_owner = NULL, lease_expires_at = NULL
    WHERE id = 'q_1'
  `;
}

describe("turn lifecycle persistence", () => {
  it("dedupes canonical events and keeps RunStep open for required actions", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await clearSeedTurn(sql);
      await sql`
        INSERT INTO turn_queue_items (
          id, channel_agent_session_id, run_step_id, bound_session_generation_id, input_type,
          input_payload_redacted_json, fifo_sequence, state, created_at
        )
        VALUES ('q_life', 'cas_1', 'step_1', 'gen_1', 'normal', '{}'::jsonb, 1, 'claimed', ${NOW})
      `;
      await sql`
        INSERT INTO agent_turns (
          id, run_step_id, channel_agent_session_id, session_generation_id, queue_item_id,
          application_run_token, agui_run_id, input_type, state, started_at
        )
        VALUES (
          'turn_life', 'step_1', 'cas_1', 'gen_1', 'q_life',
          'art_life', 'agui_life', 'normal', 'acquiring', ${NOW}
        )
      `;

      expect(await lockAgentTurnForCreate(sql, { agentTurnId: "turn_life" })).toMatchObject({
        ok: true,
        state: "creating",
      });
      expect(
        await bindTrueForgeTurnId(sql, {
          agentTurnId: "turn_life",
          trueforgeTurnId: "tf_life",
          previousTrueforgeTurnId: null,
          bindingSource: "create_response",
          now: NOW,
        }),
      ).toEqual({ ok: true });

      const event = {
        trueforgeEventId: "evt_done_1",
        normalizedType: "turn.done",
        threadId: null,
        sequenceNumber: 3,
        payloadRedacted: {
          type: "turn.done",
          id: "evt_done_1",
          state: {
            status: "done",
            required_actions: [{ type: "tool.approval_required", id: "ra_1" }],
          },
        },
      };
      const outcome = {
        kind: "required_actions" as const,
        agentTurnState: "required_actions" as const,
        runStepState: "awaiting_approval" as const,
        requiredActionCount: 1,
      };

      const first = await ingestNormalizedTrueForgeEvent(sql, {
        agentTurnId: "turn_life",
        expectedTurnStates: ["streaming", "creating", "required_actions"],
        event,
        turnDoneOutcome: outcome,
        now: NOW,
      });
      expect(first.ok).toBe(true);
      if (!first.ok) throw new Error("ingest");
      expect(first.inserted).toBe(true);

      const second = await ingestNormalizedTrueForgeEvent(sql, {
        agentTurnId: "turn_life",
        expectedTurnStates: ["required_actions", "streaming", "creating", "completed"],
        event,
        turnDoneOutcome: outcome,
        now: NOW,
      });
      expect(second.ok).toBe(true);
      if (!second.ok) throw new Error("reingest");
      expect(second.inserted).toBe(false);
      expect(second.runEventId).toBe(first.runEventId);

      const turn = await sql<{ state: string; last_trueforge_sequence: number }[]>`
        SELECT state, last_trueforge_sequence FROM agent_turns WHERE id = 'turn_life'
      `;
      expect(turn[0]).toEqual({ state: "required_actions", last_trueforge_sequence: 3 });
      const step = await sql<{ state: string; completed_at: string | Date | null }[]>`
        SELECT state, completed_at FROM run_steps WHERE id = 'step_1'
      `;
      expect(step[0]?.state).toBe("awaiting_approval");
      expect(step[0]?.completed_at).toBeNull();

      const events = await sql<{ normalized_payload_redacted_json: Record<string, unknown> }[]>`
        SELECT normalized_payload_redacted_json FROM run_events WHERE id = ${first.runEventId}
      `;
      expect(JSON.stringify(events[0]?.normalized_payload_redacted_json)).not.toContain("api_key");
    });
  }, 60_000);

  it("requires a verified history-reconciliation source to recover an uncertain turn", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await sql`UPDATE agent_turns SET state = 'uncertain' WHERE id = 'turn_1'`;

      expect(
        await bindTrueForgeTurnId(sql, {
          agentTurnId: "turn_1",
          trueforgeTurnId: "tf_recovered",
          previousTrueforgeTurnId: null,
          bindingSource: "create_response",
          now: NOW,
        }),
      ).toEqual({ ok: false, reason: "state_mismatch" });

      expect(
        await bindTrueForgeTurnId(sql, {
          agentTurnId: "turn_1",
          trueforgeTurnId: "tf_recovered",
          previousTrueforgeTurnId: null,
          bindingSource: "history_reconciliation",
          now: NOW,
        }),
      ).toEqual({ ok: true });

      const turns = await sql<{ state: string; trueforge_turn_id: string | null }[]>`
        SELECT state, trueforge_turn_id FROM agent_turns WHERE id = 'turn_1'
      `;
      expect(turns[0]).toEqual({ state: "streaming", trueforge_turn_id: "tf_recovered" });
    });
  }, 60_000);

  it("settles the durable turn, queue item, step and run on a terminal provider error", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await seedWaitingInterrupt(sql);

      const result = await ingestNormalizedTrueForgeEvent(sql, {
        agentTurnId: "turn_1",
        expectedTurnStates: ["streaming"],
        event: {
          trueforgeEventId: "evt_error_1",
          normalizedType: "turn.error",
          threadId: null,
          sequenceNumber: 4,
          payloadRedacted: {
            type: "turn.error",
            message: "provider failure",
          },
        },
        now: NOW,
      });
      expect(result.ok).toBe(true);

      const turns = await sql<{ state: string; error_json: Record<string, unknown> }[]>`
        SELECT state, error_json FROM agent_turns WHERE id = 'turn_1'
      `;
      expect(turns[0]).toEqual({
        state: "failed",
        error_json: { reason: "trueforge_terminal_error" },
      });
      const steps = await sql<{ state: string }[]>`
        SELECT state FROM run_steps WHERE id = 'step_1'
      `;
      expect(steps[0]?.state).toBe("failed");
      const queue = await sql<{ state: string; lease_owner: string | null }[]>`
        SELECT state, lease_owner FROM turn_queue_items WHERE id = 'q_1'
      `;
      expect(queue[0]).toEqual({ state: "failed", lease_owner: null });
      const runs = await sql<{ lifecycle: string }[]>`
        SELECT lifecycle FROM runs WHERE id = 'run_1'
      `;
      expect(runs[0]?.lifecycle).toBe("failed");
      const interrupts = await sql<
        { state: string; stale_at: Date | null; stale_reason: string | null }[]
      >`
        SELECT state, stale_at, result_redacted_json->>'reason' AS stale_reason
        FROM ui_component_interrupts WHERE id = 'intr_failure'
      `;
      expect(interrupts[0]).toMatchObject({
        state: "stale",
        stale_at: expect.any(Date),
        stale_reason: "run_failed",
      });
      const grants = await sql<{ revoked_at: Date | null }[]>`
        SELECT revoked_at FROM ui_surface_grants WHERE id = 'ag_failure_interrupt'
      `;
      expect(grants[0]?.revoked_at).toBeInstanceOf(Date);
    });
  }, 60_000);
});
