import { describe, expect, it } from "vitest";
import { executeClaimQueueItem, startWorkerProcess } from "./index";
import { claimTurnQueueItem, enqueueTurnQueueItem } from "@forgeroom/db";
import { NOW, seedRuntime, withMigratedDatabase } from "@forgeroom/db/test-harness";

describe("standalone worker process", () => {
  it("does not embed inside the API", () => {
    const handle = startWorkerProcess();
    expect(handle.kind).toBe("worker");
    expect(handle.embedded).toBe(false);
  });

  it("validates every production dispatch through the shared contract package", async () => {
    const executed: string[] = [];
    const handle = startWorkerProcess((command) => {
      executed.push(command.command_id);
    });
    expect(
      (
        await handle.dispatchCommand({
          schemaVersion: 1,
          command_id: "cmd_1",
          name: "claim_queue_item",
          payload: {
            queue_item_id: "queue_1",
            expected_state: "queued",
            expected_attempt: 0,
            worker_id: "worker_1",
            lease_expires_at: "2026-08-26T00:00:00.000Z",
          },
        })
      ).command.name,
    ).toBe("claim_queue_item");
    // Without a SQL client, claim is unavailable and the executor must not run.
    expect(executed).toEqual([]);

    await expect(
      handle.dispatchCommand({
        schemaVersion: 1,
        command_id: "cmd_2",
        name: "claim_pause_group_resume",
        payload: {},
      }),
    ).rejects.toThrow();

    await expect(
      handle.dispatchCommand({
        schemaVersion: 1,
        command_id: "cmd_3",
        name: "ingest_trueforge_event",
        payload: {
          run_id: "run_1",
          run_step_id: "step_1",
          agent_turn_id: "turn_1",
          expected_turn_state: "streaming",
          session_generation_id: "generation_1",
          expected_session_generation: 1,
          upstream_event_id: "event_1",
          upstream_event_type: "tool.result",
          event_payload: { refresh_token: "must-not-cross-worker-boundary" },
        },
      }),
    ).rejects.toThrow();
    expect(executed).toEqual([]);
  });

  it("claims a queued item through the worker boundary without holding a network call", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await sql`UPDATE agent_turns SET state = 'completed', completed_at = ${NOW} WHERE id = 'turn_1'`;
      await sql`
        UPDATE turn_queue_items
        SET state = 'completed', completed_at = ${NOW}
        WHERE id = 'q_1'
      `;
      await enqueueTurnQueueItem(sql, {
        id: "q_worker",
        channelAgentSessionId: "cas_1",
        runStepId: "step_1",
        inputType: "normal",
      });

      const executed: string[] = [];
      const handle = startWorkerProcess({
        sql,
        executeCommand: (command) => {
          executed.push(command.command_id);
        },
      });
      const result = await handle.dispatchCommand({
        schemaVersion: 1,
        command_id: "cmd_claim",
        name: "claim_queue_item",
        payload: {
          queue_item_id: "q_worker",
          expected_state: "queued",
          expected_attempt: 0,
          worker_id: "worker_live",
          lease_expires_at: "2099-01-01T00:00:00.000Z",
        },
      });

      expect(result.claim?.ok).toBe(true);
      if (!result.claim?.ok) {
        throw new Error("expected claim");
      }
      expect(result.claim.leaseOwner).toBe("worker_live");
      expect(executed).toEqual(["cmd_claim"]);

      executed.length = 0;
      const second = await executeClaimQueueItem(sql, {
        schemaVersion: 1,
        command_id: "cmd_claim_2",
        name: "claim_queue_item",
        payload: {
          queue_item_id: "q_worker",
          expected_state: "queued",
          expected_attempt: 0,
          worker_id: "worker_other",
          lease_expires_at: "2099-01-01T00:00:00.000Z",
        },
      });
      expect(second).toEqual({ ok: false, reason: "not_queued" });

      const failedDispatch = await handle.dispatchCommand({
        schemaVersion: 1,
        command_id: "cmd_claim_fail",
        name: "claim_queue_item",
        payload: {
          queue_item_id: "q_worker",
          expected_state: "queued",
          expected_attempt: 0,
          worker_id: "worker_other",
          lease_expires_at: "2099-01-01T00:00:00.000Z",
        },
      });
      expect(failedDispatch.claim).toEqual({ ok: false, reason: "not_queued" });
      expect(executed).toEqual([]);

      await enqueueTurnQueueItem(sql, {
        id: "q_worker_b",
        channelAgentSessionId: "cas_1",
        runStepId: "step_1",
        inputType: "normal",
      });
      expect(
        await claimTurnQueueItem(sql, {
          queueItemId: "q_worker_b",
          workerId: "worker_busy",
          leaseExpiresAt: "2099-01-01T00:00:00.000Z",
          now: NOW,
        }),
      ).toEqual({ ok: false, reason: "session_busy" });
    });
  }, 60_000);

  it("dispatches component tool worker commands when SQL is configured", async () => {
    const HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const executed: string[] = [];
      const handle = startWorkerProcess({
        sql,
        executeCommand: (command) => {
          executed.push(command.name);
        },
      });
      const offer = await handle.dispatchCommand({
        schemaVersion: 1,
        command_id: "offer_1",
        name: "offer_and_recheck_component_tool",
        payload: {
          channel_id: "ch_1",
          coworker_id: "cw_1",
          run_step_id: "step_1",
          agent_turn_id: "turn_1",
          expected_session_generation: 1,
          component_version_id: "compv_1",
          expected_descriptor_hash: HASH,
          expected_grant_scope_hash: HASH,
        },
      });
      expect(offer.offerAndRecheckComponentTool?.ok).toBe(false);
      expect(executed).toEqual([]);

      const finalize = await handle.dispatchCommand({
        schemaVersion: 1,
        command_id: "finalize_1",
        name: "finalize_or_quarantine_ui_instance",
        payload: {
          ui_instance_id: "ui_1",
          expected_status: "building",
          expected_render_revision: null,
          next_render_revision: 1,
          render_manifest_hash: HASH,
          outcome: "ready",
        },
      });
      expect(finalize.finalizeUiInstance?.ok).toBe(true);
      expect(executed).toEqual(["finalize_or_quarantine_ui_instance"]);
    });
  }, 60_000);
});
