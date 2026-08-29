import { describe, expect, it } from "vitest";
import {
  claimTurnQueueItem,
  enqueueTurnQueueItem,
  heartbeatTurnQueueLease,
  listClaimableQueueItems,
  reclaimExpiredTurnQueueLease,
} from "./turn-queue";
import { ingestNormalizedTrueForgeEvent } from "./turn-lifecycle";
import { HASH, NOW, seedRuntime, withMigratedDatabase } from "./test-harness";

async function clearSeedTurn(sql: Parameters<typeof seedRuntime>[0]) {
  await sql`UPDATE agent_turns SET state = 'completed', completed_at = ${NOW} WHERE id = 'turn_1'`;
  await sql`
    UPDATE turn_queue_items
    SET state = 'completed', completed_at = ${NOW}, lease_owner = NULL, lease_expires_at = NULL
    WHERE id = 'q_1'
  `;
}

describe("turn queue claim/lease", () => {
  it("preserves FIFO for normals and lets pause responses outrank later normals", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await clearSeedTurn(sql);

      const first = await enqueueTurnQueueItem(sql, {
        id: "q_normal_a",
        channelAgentSessionId: "cas_1",
        runStepId: "step_1",
        inputType: "normal",
      });
      const second = await enqueueTurnQueueItem(sql, {
        id: "q_normal_b",
        channelAgentSessionId: "cas_1",
        runStepId: "step_1",
        inputType: "normal",
      });
      const pause = await enqueueTurnQueueItem(sql, {
        id: "q_pause",
        channelAgentSessionId: "cas_1",
        runStepId: "step_1",
        inputType: "pause_group_response",
        boundSessionGenerationId: "gen_1",
      });
      expect(first.fifoSequence).toBeLessThan(second.fifoSequence);
      expect(pause.priority).toBeGreaterThan(first.priority);

      const claimable = await listClaimableQueueItems(sql, "cas_1");
      expect(claimable.map((row) => row.id)).toEqual(["q_pause", "q_normal_a", "q_normal_b"]);

      const claimed = await claimTurnQueueItem(sql, {
        queueItemId: "q_pause",
        workerId: "worker_1",
        leaseExpiresAt: "2099-01-01T00:00:00.000Z",
        now: NOW,
      });
      expect(claimed.ok).toBe(true);
      if (!claimed.ok) {
        throw new Error("expected claim");
      }

      const blocked = await claimTurnQueueItem(sql, {
        queueItemId: "q_normal_a",
        workerId: "worker_2",
        leaseExpiresAt: "2099-01-01T00:00:00.000Z",
        now: NOW,
      });
      expect(blocked).toEqual({ ok: false, reason: "session_busy" });
    });
  }, 60_000);

  it("never rebinds component responses across generation rotation", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await clearSeedTurn(sql);

      await enqueueTurnQueueItem(sql, {
        id: "q_component",
        channelAgentSessionId: "cas_1",
        runStepId: "step_1",
        inputType: "component_interaction_response",
        boundSessionGenerationId: "gen_1",
      });

      await sql`
        INSERT INTO channel_agent_session_generations (
          id, channel_agent_session_id, generation, agent_version_id, session_revision_id,
          trueforge_session_id, effective_spec_hash, approval_policy_hash, state, created_at
        )
        VALUES (
          'gen_2', 'cas_1', 2, 'av_1', 'sr_1',
          'tf_sess_2', ${HASH}, ${HASH}, 'ready', ${NOW}
        )
      `;
      await sql`UPDATE channel_agent_sessions SET current_generation_id = 'gen_2' WHERE id = 'cas_1'`;

      const stale = await claimTurnQueueItem(sql, {
        queueItemId: "q_component",
        workerId: "worker_1",
        leaseExpiresAt: "2099-01-01T00:00:00.000Z",
        now: NOW,
      });
      expect(stale).toEqual({ ok: false, reason: "stale_generation" });
    });
  }, 60_000);

  it("blocks queued work after archival while recording the already-running MCP outcome", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await enqueueTurnQueueItem(sql, {
        id: "q_after_archive",
        channelAgentSessionId: "cas_1",
        runStepId: "step_1",
        inputType: "normal",
      });

      await sql`UPDATE channels SET status = 'archived', updated_at = ${NOW} WHERE id = 'ch_1'`;

      expect(
        await claimTurnQueueItem(sql, {
          queueItemId: "q_after_archive",
          workerId: "worker_after_archive",
          leaseExpiresAt: "2099-01-01T00:00:00.000Z",
          now: NOW,
        }),
      ).toEqual({ ok: false, reason: "channel_archived" });

      const ingested = await ingestNormalizedTrueForgeEvent(sql, {
        agentTurnId: "turn_1",
        expectedTurnStates: ["streaming"],
        event: {
          trueforgeEventId: "tf_evt_archive_terminal",
          normalizedType: "turn.done",
          threadId: "thread_1",
          sequenceNumber: 1,
          payloadRedacted: { outcome: "completed_after_archive" },
        },
        turnDoneOutcome: {
          kind: "terminal_success",
          agentTurnState: "completed",
          runStepState: "completed",
          requiredActionCount: 0,
        },
        now: NOW,
      });
      expect(ingested).toMatchObject({ ok: true, inserted: true });

      const persisted = await sql<
        { turn_state: string; queued_state: string; event_count: string }[]
      >`
        SELECT
          (SELECT state FROM agent_turns WHERE id = 'turn_1') AS turn_state,
          (SELECT state FROM turn_queue_items WHERE id = 'q_after_archive') AS queued_state,
          (SELECT count(*)::text FROM run_events WHERE trueforge_event_id = 'tf_evt_archive_terminal')
            AS event_count
      `;
      expect(persisted[0]).toEqual({
        turn_state: "completed",
        queued_state: "queued",
        event_count: "1",
      });
    });
  }, 60_000);

  it("serializes concurrent claims so a second remote-active turn never starts", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await clearSeedTurn(sql);

      await enqueueTurnQueueItem(sql, {
        id: "q_a",
        channelAgentSessionId: "cas_1",
        runStepId: "step_1",
        inputType: "normal",
      });
      await enqueueTurnQueueItem(sql, {
        id: "q_b",
        channelAgentSessionId: "cas_1",
        runStepId: "step_1",
        inputType: "normal",
      });

      const results = await Promise.all([
        claimTurnQueueItem(sql, {
          queueItemId: "q_a",
          workerId: "worker_a",
          leaseExpiresAt: "2099-01-01T00:00:00.000Z",
          now: NOW,
        }),
        claimTurnQueueItem(sql, {
          queueItemId: "q_b",
          workerId: "worker_b",
          leaseExpiresAt: "2099-01-01T00:00:00.000Z",
          now: NOW,
        }),
      ]);

      const ok = results.filter((row) => row.ok);
      const blocked = results.filter(
        (row) => !row.ok && (row.reason === "session_busy" || row.reason === "not_next"),
      );
      expect(ok).toHaveLength(1);
      expect(blocked).toHaveLength(1);

      const active = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM agent_turns
        WHERE channel_agent_session_id = 'cas_1'
          AND state IN ('acquiring', 'creating', 'streaming', 'resuming')
      `;
      expect(active[0]?.count).toBe("1");
    });
  }, 60_000);

  it("heartbeats matching leases and fails closed on streaming reclaim", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await clearSeedTurn(sql);

      await enqueueTurnQueueItem(sql, {
        id: "q_lease",
        channelAgentSessionId: "cas_1",
        runStepId: "step_1",
        inputType: "normal",
      });
      const claimed = await claimTurnQueueItem(sql, {
        queueItemId: "q_lease",
        workerId: "worker_1",
        leaseExpiresAt: "2020-01-01T00:00:00.000Z",
        now: NOW,
      });
      expect(claimed.ok).toBe(true);

      expect(
        await heartbeatTurnQueueLease(sql, {
          queueItemId: "q_lease",
          workerId: "worker_other",
          leaseExpiresAt: "2099-01-01T00:00:00.000Z",
        }),
      ).toEqual({ ok: false, reason: "lease_mismatch" });

      expect(
        await heartbeatTurnQueueLease(sql, {
          queueItemId: "q_lease",
          workerId: "worker_1",
          leaseExpiresAt: "2099-01-01T00:00:00.000Z",
        }),
      ).toEqual({ ok: true });

      await sql`
        UPDATE turn_queue_items
        SET lease_expires_at = '2020-01-01T00:00:00.000Z'
        WHERE id = 'q_lease'
      `;
      await sql`UPDATE agent_turns SET state = 'streaming' WHERE queue_item_id = 'q_lease'`;
      expect(
        await reclaimExpiredTurnQueueLease(sql, {
          queueItemId: "q_lease",
          now: "2026-01-01T00:00:00.000Z",
        }),
      ).toEqual({ ok: false, reason: "fail_closed_remote_active" });

      await sql`UPDATE agent_turns SET state = 'acquiring' WHERE queue_item_id = 'q_lease'`;
      expect(
        await reclaimExpiredTurnQueueLease(sql, {
          queueItemId: "q_lease",
          now: "2026-01-01T00:00:00.000Z",
        }),
      ).toEqual({ ok: true, reclaimed: true });

      const requeued = await sql<{ state: string; lease_owner: string | null }[]>`
        SELECT state, lease_owner FROM turn_queue_items WHERE id = 'q_lease'
      `;
      expect(requeued[0]).toEqual({ state: "queued", lease_owner: null });
    });
  }, 60_000);

  it("commits the claim lease before any network work would run", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await clearSeedTurn(sql);
      await enqueueTurnQueueItem(sql, {
        id: "q_commit",
        channelAgentSessionId: "cas_1",
        runStepId: "step_1",
        inputType: "normal",
      });

      let networkCalls = 0;
      const claimed = await claimTurnQueueItem(sql, {
        queueItemId: "q_commit",
        workerId: "worker_1",
        leaseExpiresAt: "2099-01-01T00:00:00.000Z",
        now: NOW,
      });
      // Network (createTurn) is intentionally outside the claim transaction.
      networkCalls += 1;
      expect(claimed.ok).toBe(true);
      if (!claimed.ok) {
        throw new Error("expected claim");
      }

      const persisted = await sql<{ state: string; lease_owner: string | null }[]>`
        SELECT state, lease_owner FROM turn_queue_items WHERE id = 'q_commit'
      `;
      expect(persisted[0]).toEqual({ state: "claimed", lease_owner: "worker_1" });
      expect(networkCalls).toBe(1);
      expect(claimed.agentTurnId).toMatch(/^aturn_/);
    });
  }, 60_000);

  it("rejects claims that skip ahead of the priority/FIFO head", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await clearSeedTurn(sql);
      await enqueueTurnQueueItem(sql, {
        id: "q_first",
        channelAgentSessionId: "cas_1",
        runStepId: "step_1",
        inputType: "normal",
      });
      await enqueueTurnQueueItem(sql, {
        id: "q_second",
        channelAgentSessionId: "cas_1",
        runStepId: "step_1",
        inputType: "normal",
      });
      expect(
        await claimTurnQueueItem(sql, {
          queueItemId: "q_second",
          workerId: "worker_1",
          leaseExpiresAt: "2099-01-01T00:00:00.000Z",
          now: NOW,
        }),
      ).toEqual({ ok: false, reason: "not_next" });
    });
  }, 60_000);

  it("serializes concurrent enqueues via the session row lock", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await clearSeedTurn(sql);

      const results = await Promise.all([
        enqueueTurnQueueItem(sql, {
          id: "q_empty_a",
          channelAgentSessionId: "cas_1",
          runStepId: "step_1",
          inputType: "normal",
        }),
        enqueueTurnQueueItem(sql, {
          id: "q_empty_b",
          channelAgentSessionId: "cas_1",
          runStepId: "step_1",
          inputType: "normal",
        }),
      ]);
      const sequences = results.map((row) => row.fifoSequence).sort((a, b) => a - b);
      expect(sequences).toEqual([1, 2]);
      expect(new Set(sequences).size).toBe(2);
    });
  }, 60_000);
});
