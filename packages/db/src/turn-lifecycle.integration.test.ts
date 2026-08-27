import { describe, expect, it } from "vitest";
import { bindTrueForgeTurnId, ingestNormalizedTrueForgeEvent } from "./turn-lifecycle";
import { NOW, seedRuntime, withMigratedDatabase } from "./test-harness";

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

      expect(
        await bindTrueForgeTurnId(sql, {
          agentTurnId: "turn_life",
          trueforgeTurnId: "tf_life",
          previousTrueforgeTurnId: null,
          expectedStates: ["acquiring", "creating", "uncertain"],
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
});
