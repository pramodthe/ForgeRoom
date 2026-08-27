import { describe, expect, it } from "vitest";
import {
  createDirectMultiAgentRun,
  loadRunProjection,
  refreshRunLifecycle,
} from "./multi-agent-run";
import { claimTurnQueueItem } from "./turn-queue";
import { HASH, NOW, seedRuntime, withMigratedDatabase } from "./test-harness";

async function seedSecondCoworker(sql: Parameters<typeof seedRuntime>[0]) {
  await sql`
    INSERT INTO agent_profiles (
      id, workspace_id, handle, name, title, visibility, status,
      editable_config_json, config_revision, native_subagents_enabled, created_at, updated_at
    )
    VALUES (
      'cw_2', 'ws_1', 'analyst', 'Analyst', 'Writer', 'workspace', 'active',
      '{}'::jsonb, 1, false, ${NOW}, ${NOW}
    )
  `;
  await sql`
    INSERT INTO agent_versions (id, agent_profile_id, version, config_json, spec_hash, created_by, created_at)
    VALUES ('av_2', 'cw_2', 1, '{}'::jsonb, ${HASH}, 'user_1', ${NOW})
  `;
  await sql`UPDATE agent_profiles SET current_version_id = 'av_2' WHERE id = 'cw_2'`;
  await sql`
    INSERT INTO session_revisions (
      id, agent_profile_id, source_config_revision, effective_config_redacted_json,
      effective_spec_hash, approval_policy_hash, created_by, created_at
    )
    VALUES ('sr_2', 'cw_2', 1, '{}'::jsonb, ${HASH}, ${HASH}, 'user_1', ${NOW})
  `;
  await sql`
    INSERT INTO channel_agent_sessions (
      id, workspace_id, channel_id, agent_profile_id, logical_agui_thread_id,
      last_delivered_channel_sequence, state, created_at, updated_at
    )
    VALUES ('cas_2', 'ws_1', 'ch_1', 'cw_2', 'thread_2', 0, 'active', ${NOW}, ${NOW})
  `;
  await sql`
    INSERT INTO channel_agent_session_generations (
      id, channel_agent_session_id, generation, agent_version_id, session_revision_id,
      trueforge_session_id, effective_spec_hash, approval_policy_hash, state, created_at
    )
    VALUES ('gen_2', 'cas_2', 1, 'av_2', 'sr_2', 'tf_sess_2', ${HASH}, ${HASH}, 'ready', ${NOW})
  `;
  await sql`UPDATE channel_agent_sessions SET current_generation_id = 'gen_2' WHERE id = 'cas_2'`;
}

async function insertFanoutMessage(sql: Parameters<typeof seedRuntime>[0]) {
  await sql`
    INSERT INTO channel_events (
      id, channel_id, sequence, type, actor_type, actor_id, payload_json, created_at
    )
    VALUES ('evt_fanout', 'ch_1', 1, 'message.created', 'human', 'user_1', '{}'::jsonb, ${NOW})
  `;
  await sql`
    INSERT INTO messages (id, channel_id, event_id, author_type, author_id, body, created_at)
    VALUES ('msg_fanout', 'ch_1', 'evt_fanout', 'human', 'user_1', '@research @analyst inspect', ${NOW})
  `;
  await sql`UPDATE channels SET next_sequence = 2 WHERE id = 'ch_1'`;
}

describe("direct multi-agent run", () => {
  it("atomically creates run, steps, and queue items referencing one sourceMessageId", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await seedSecondCoworker(sql);
      await insertFanoutMessage(sql);

      const created = await createDirectMultiAgentRun(sql, {
        id: "run_fanout",
        channelId: "ch_1",
        sourceMessageId: "msg_fanout",
        requestedBy: "user_1",
        routingMode: "direct",
        goal: "Inspect the fixture",
        now: NOW,
        steps: [
          {
            id: "step_a",
            assignedAgentId: "cw_1",
            channelAgentSessionId: "cas_1",
            logicalThreadId: "thread_1",
            objective: "Inspect the fixture",
            queueItemId: "q_a",
          },
          {
            id: "step_b",
            assignedAgentId: "cw_2",
            channelAgentSessionId: "cas_2",
            logicalThreadId: "thread_2",
            objective: "Inspect the fixture",
            queueItemId: "q_b",
          },
        ],
      });

      expect(created.runId).toBe("run_fanout");
      expect(created.steps).toHaveLength(2);

      const projection = await loadRunProjection(sql, "run_fanout");
      expect(projection?.sourceMessageId).toBe("msg_fanout");
      expect(projection?.lifecycle).toBe("queued");
      expect(projection?.activity.queued).toBe(2);

      const payloads = await sql<{ input_payload_redacted_json: unknown }[]>`
        SELECT input_payload_redacted_json FROM turn_queue_items WHERE id IN ('q_a', 'q_b')
      `;
      for (const row of payloads) {
        const payload =
          typeof row.input_payload_redacted_json === "string"
            ? JSON.parse(row.input_payload_redacted_json)
            : row.input_payload_redacted_json;
        expect(payload).toMatchObject({
          source_message_id: "msg_fanout",
          emit_human_transcript: false,
        });
      }
    });
  }, 60_000);

  it("rolls back the whole run transaction when a session is missing", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await insertFanoutMessage(sql);

      await expect(
        createDirectMultiAgentRun(sql, {
          id: "run_bad",
          channelId: "ch_1",
          sourceMessageId: "msg_fanout",
          requestedBy: "user_1",
          routingMode: "direct",
          goal: "Inspect",
          steps: [
            {
              assignedAgentId: "cw_1",
              channelAgentSessionId: "cas_1",
              logicalThreadId: "thread_1",
              objective: "Inspect",
            },
            {
              assignedAgentId: "cw_missing",
              channelAgentSessionId: "cas_missing",
              logicalThreadId: "thread_x",
              objective: "Inspect",
            },
          ],
        }),
      ).rejects.toThrow(/channel_agent_session not found/);

      const runs = await sql`SELECT id FROM runs WHERE id = 'run_bad'`;
      expect(runs).toHaveLength(0);
      const steps = await sql`SELECT id FROM run_steps WHERE run_id = 'run_bad'`;
      expect(steps).toHaveLength(0);
    });
  }, 60_000);

  it("claims different-session steps concurrently and serializes same-session FIFO", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await seedSecondCoworker(sql);
      await insertFanoutMessage(sql);

      // Clear seeded active turn so cas_1 can claim again.
      await sql`UPDATE agent_turns SET state = 'completed', completed_at = ${NOW} WHERE id = 'turn_1'`;
      await sql`UPDATE run_steps SET state = 'completed', completed_at = ${NOW} WHERE id = 'step_1'`;
      await sql`UPDATE turn_queue_items SET state = 'completed', completed_at = ${NOW} WHERE id = 'q_1'`;

      const created = await createDirectMultiAgentRun(sql, {
        channelId: "ch_1",
        sourceMessageId: "msg_fanout",
        requestedBy: "user_1",
        routingMode: "direct",
        goal: "Inspect",
        now: NOW,
        steps: [
          {
            id: "step_a",
            assignedAgentId: "cw_1",
            channelAgentSessionId: "cas_1",
            logicalThreadId: "thread_1",
            objective: "Inspect",
            queueItemId: "q_a",
          },
          {
            id: "step_b",
            assignedAgentId: "cw_2",
            channelAgentSessionId: "cas_2",
            logicalThreadId: "thread_2",
            objective: "Inspect",
            queueItemId: "q_b",
          },
        ],
      });

      const [claimA, claimB] = await Promise.all([
        claimTurnQueueItem(sql, {
          queueItemId: created.steps[0]!.queueItemId,
          workerId: "worker_a",
          leaseExpiresAt: "2099-01-01T00:00:00.000Z",
          now: NOW,
        }),
        claimTurnQueueItem(sql, {
          queueItemId: created.steps[1]!.queueItemId,
          workerId: "worker_b",
          leaseExpiresAt: "2099-01-01T00:00:00.000Z",
          now: NOW,
        }),
      ]);
      expect(claimA.ok).toBe(true);
      expect(claimB.ok).toBe(true);

      // Same-session second message queues behind and cannot claim while busy.
      await sql`
        INSERT INTO channel_events (
          id, channel_id, sequence, type, actor_type, actor_id, payload_json, created_at
        )
        VALUES ('evt_2', 'ch_1', 2, 'message.created', 'human', 'user_1', '{}'::jsonb, ${NOW})
      `;
      await sql`
        INSERT INTO messages (id, channel_id, event_id, author_type, author_id, body, created_at)
        VALUES ('msg_2', 'ch_1', 'evt_2', 'human', 'user_1', '@research again', ${NOW})
      `;
      const second = await createDirectMultiAgentRun(sql, {
        channelId: "ch_1",
        sourceMessageId: "msg_2",
        requestedBy: "user_1",
        routingMode: "direct",
        goal: "Follow up",
        now: NOW,
        steps: [
          {
            id: "step_c",
            assignedAgentId: "cw_1",
            channelAgentSessionId: "cas_1",
            logicalThreadId: "thread_1",
            objective: "Follow up",
            queueItemId: "q_c",
          },
        ],
      });
      const blocked = await claimTurnQueueItem(sql, {
        queueItemId: second.steps[0]!.queueItemId,
        workerId: "worker_c",
        leaseExpiresAt: "2099-01-01T00:00:00.000Z",
        now: NOW,
      });
      expect(blocked).toEqual({ ok: false, reason: "session_busy" });

      const fifo = await sql<{ id: string; fifo_sequence: number }[]>`
        SELECT id, fifo_sequence FROM turn_queue_items
        WHERE channel_agent_session_id = 'cas_1' AND id IN ('q_a', 'q_c')
        ORDER BY fifo_sequence ASC
      `;
      expect(fifo.map((row) => row.id)).toEqual(["q_a", "q_c"]);
    });
  }, 60_000);

  it("refreshes lifecycle and activity counters from step outcomes without synthesis", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await seedSecondCoworker(sql);
      await insertFanoutMessage(sql);

      await createDirectMultiAgentRun(sql, {
        id: "run_agg",
        channelId: "ch_1",
        sourceMessageId: "msg_fanout",
        requestedBy: "user_1",
        routingMode: "direct",
        goal: "Inspect",
        now: NOW,
        steps: [
          {
            id: "step_a",
            assignedAgentId: "cw_1",
            channelAgentSessionId: "cas_1",
            logicalThreadId: "thread_1",
            objective: "Inspect",
          },
          {
            id: "step_b",
            assignedAgentId: "cw_2",
            channelAgentSessionId: "cas_2",
            logicalThreadId: "thread_2",
            objective: "Inspect",
          },
        ],
      });

      await sql`UPDATE run_steps SET state = 'running' WHERE id = 'step_a'`;
      await sql`UPDATE run_steps SET state = 'awaiting_approval' WHERE id = 'step_b'`;
      let projection = await refreshRunLifecycle(sql, { runId: "run_agg", now: NOW });
      expect(projection.lifecycle).toBe("active");
      expect(projection.activity.running).toBe(1);
      expect(projection.activity.awaiting_approval).toBe(1);

      await sql`UPDATE run_steps SET state = 'completed', completed_at = ${NOW} WHERE id = 'step_a'`;
      await sql`UPDATE run_steps SET state = 'failed', completed_at = ${NOW} WHERE id = 'step_b'`;
      projection = await refreshRunLifecycle(sql, { runId: "run_agg", now: NOW });
      expect(projection.lifecycle).toBe("partial");
      expect(projection.activity).toEqual({
        planning: 0,
        running: 0,
        awaiting_input: 0,
        awaiting_approval: 0,
        blocked_connection: 0,
        cancelling: 0,
        queued: 0,
      });
    });
  }, 60_000);
});
