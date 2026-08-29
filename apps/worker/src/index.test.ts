import { describe, expect, it, vi } from "vitest";
import {
  executeClaimQueueItem,
  executeCreateOrReconcileTurn,
  executeIngestTrueForgeEvent,
  startWorkerProcess,
} from "./index";
import {
  claimTurnQueueItem,
  commitUiInteraction,
  enqueueTurnQueueItem,
  issueUiInteractionToken,
  loadAgentTurnCreateContext,
} from "@forgeroom/db";
import { actionGrantSchema } from "@forgeroom/contracts";
import { canonicalizeJson } from "@forgeroom/domain";
import { createHash } from "node:crypto";
import { HASH, NOW, seedRuntime, withMigratedDatabase } from "@forgeroom/db/test-harness";

const TEST_NOW = "2020-01-01T00:00:00.000Z";
const INTERACTION_TOKEN_SECRET = "test-interaction-token-secret";

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalizeJson(value), "utf8").digest("hex")}`;
}

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

  it("retries retired MCP cleanup when a terminal event is redelivered", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await sql`
        INSERT INTO channel_agent_session_generations (
          id, channel_agent_session_id, generation, agent_version_id, session_revision_id,
          trueforge_session_id, effective_spec_hash, approval_policy_hash, state, created_at
        ) VALUES (
          'gen_2', 'cas_1', 2, 'av_1', 'sr_1', 'tf_sess_2',
          ${"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
          ${"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
          'ready', ${NOW}
        )
      `;
      await sql`
        UPDATE channel_agent_sessions SET current_generation_id = 'gen_2' WHERE id = 'cas_1'
      `;
      await sql`
        UPDATE channel_agent_session_generations
        SET state = 'retired', retired_at = ${NOW}
        WHERE id = 'gen_1'
      `;

      let failFirstDelete = true;
      const deleteHeaderAuthMcpServer = vi.fn(async () => {
        if (failFirstDelete) {
          failFirstDelete = false;
          throw new Error("transient connector deletion failure");
        }
      });
      const command = {
        schemaVersion: 1 as const,
        command_id: "cmd_terminal_cleanup",
        name: "ingest_trueforge_event" as const,
        payload: {
          run_id: "run_1",
          run_step_id: "step_1",
          agent_turn_id: "turn_1",
          expected_turn_state: "streaming" as const,
          session_generation_id: "gen_1",
          expected_session_generation: 1,
          upstream_event_id: "event_terminal_cleanup",
          upstream_event_type: "turn.done",
          event_payload: { state: { status: "done" } },
        },
      };

      const first = await executeIngestTrueForgeEvent(sql, command, {
        trueforge: { deleteHeaderAuthMcpServer },
      });
      expect(first.ok).toBe(true);
      expect(deleteHeaderAuthMcpServer).toHaveBeenCalledTimes(1);

      const replay = await executeIngestTrueForgeEvent(sql, command, {
        trueforge: { deleteHeaderAuthMcpServer },
      });
      expect(replay).toEqual({ ok: false, reason: "state_mismatch" });
      expect(deleteHeaderAuthMcpServer).toHaveBeenCalledTimes(2);

      const cleanupAudits = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM audit_events
        WHERE action = 'session.mcp_connector_deleted'
          AND target_id = 'gen_1'
      `;
      expect(cleanupAudits[0]?.count).toBe("1");
    });
  }, 60_000);

  it("creates a component continuation turn and marks the interrupt continued", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await sql`
        UPDATE agent_turns
        SET state = 'completed', completed_at = ${NOW}, trueforge_turn_id = 'tf_source'
        WHERE id = 'turn_1'
      `;
      await sql`
        UPDATE turn_queue_items
        SET state = 'completed', completed_at = ${NOW}
        WHERE id = 'q_1'
      `;

      const inputSchema = {
        type: "object",
        additionalProperties: false,
        properties: { selectedRowId: { type: "string" } },
      };
      const interruptId = "intr_worker";
      const actionBody = actionGrantSchema.parse({
        schemaVersion: 1,
        id: "ag_complete_worker",
        workspace_id: "ws_1",
        channel_id: "ch_1",
        surface_id: "ui_1",
        policy_revision: 1,
        issued_by: "application_policy",
        expires_at: NOW,
        revoked_at: null,
        grant_scope_hash: HASH,
        created_at: NOW,
        kind: "action",
        bound_render_revision: 0,
        bound_manifest_hash: HASH,
        action_ref: "submit",
        handler_key: "controlled_ui.complete_component_interrupt.v1",
        input_schema: inputSchema,
        input_schema_hash: sha256(inputSchema),
        allowed_render_node_ids: ["node_1"],
        requires_recent_auth: false,
        requires_trusted_confirmation: false,
        max_uses: 1,
        use_count: 0,
        mode: "complete_component_interrupt",
        component_interrupt_id: interruptId,
      });

      await sql`
        INSERT INTO ui_instance_revisions (
          id, ui_instance_id, revision_kind, revision, component_version_id, renderer_profile_hash,
          validator_policy_version, render_node_set_json, render_node_set_hash, render_payload_json,
          render_payload_hash, render_manifest_json, manifest_hash, validated_props_json, validated_props_hash,
          accessible_summary, content_hash, validation_state, created_at, promoted_at
        ) VALUES (
          'uirev_worker_0', 'ui_1', 'render', 0, 'compv_1', ${HASH},
          'registry_v1', '[{"nodeId":"node_1"}]'::jsonb, ${HASH}, '{}'::jsonb,
          ${HASH}, '{}'::jsonb, ${HASH}, '{}'::jsonb, ${HASH},
          'A table', ${HASH}, 'valid', ${NOW}, ${NOW}
        )
      `;
      await sql`
        UPDATE ui_instances
        SET status = 'ready', current_render_revision = 0, last_good_render_revision = 0,
            ready_at = ${NOW}, updated_at = ${NOW}
        WHERE id = 'ui_1'
      `;
      await sql.begin(async (tx) => {
        await tx`
          INSERT INTO ui_surface_grants (
            id, ui_instance_id, grant_kind, policy_revision, bound_render_revision, bound_manifest_hash,
            action_ref, handler_key, action_mode, input_schema_json, input_schema_hash,
            allowed_render_node_ids_json, component_interrupt_id, grant_body_redacted_json, grant_scope_hash,
            max_uses, use_count, issued_by, expires_at, created_at
          ) VALUES (
            'ag_complete_worker', 'ui_1', 'action', 1, 0, ${HASH}, 'submit',
            'controlled_ui.complete_component_interrupt.v1', 'complete_component_interrupt',
            ${JSON.stringify(inputSchema)}::jsonb, ${sha256(inputSchema)}, '["node_1"]'::jsonb,
            ${interruptId}, ${JSON.stringify(actionBody)}::jsonb, ${HASH}, 1, 0,
            'application_policy', ${NOW}, ${NOW}
          )
        `;
        await tx`
          INSERT INTO ui_component_interrupts (
            id, ui_instance_id, run_id, run_step_id, agent_turn_id, logical_thread_id,
            tool_call_id, session_generation_id, action_grant_id, input_schema_hash, state, created_at
          ) VALUES (
            ${interruptId}, 'ui_1', 'run_1', 'step_1', 'turn_1', 'thread_1',
            'tc_1', 'gen_1', 'ag_complete_worker', ${sha256(inputSchema)}, 'waiting', ${NOW}
          )
        `;
      });

      const issued = await issueUiInteractionToken(sql, {
        instanceId: "ui_1",
        workspaceId: "ws_1",
        actorUserId: "user_1",
        request: {
          schemaVersion: 1,
          surfaceId: "ui_1",
          renderNodeId: "node_1",
          renderRevision: 0,
          expectedStateRevision: null,
          actionGrantId: "ag_complete_worker",
          actionRef: "submit",
          input: { selectedRowId: "row_1" },
          clientKind: "registry",
          idempotencyKey: "worker-continuation-test",
        },
        interactionTokenSecret: INTERACTION_TOKEN_SECRET,
        now: TEST_NOW,
      });
      if (!issued.ok) throw new Error(`${issued.error.code}: ${issued.error.message}`);

      const committed = await commitUiInteraction(sql, {
        instanceId: "ui_1",
        workspaceId: "ws_1",
        actorUserId: "user_1",
        interactionId: issued.value.interactionId,
        interactionToken: issued.value.interactionToken,
        now: TEST_NOW,
      });
      expect(committed.ok).toBe(true);

      const [interrupt] = await sql<{ continuation_queue_item_id: string | null }[]>`
        SELECT continuation_queue_item_id
        FROM ui_component_interrupts
        WHERE id = ${interruptId}
      `;
      const queueItemId = interrupt?.continuation_queue_item_id;
      if (!queueItemId) throw new Error("expected continuation queue item");

      const claim = await claimTurnQueueItem(sql, {
        queueItemId,
        workerId: "worker_continuation",
        leaseExpiresAt: "2099-01-01T00:00:00.000Z",
        now: NOW,
      });
      expect(claim.ok).toBe(true);
      if (!claim.ok) throw new Error("expected claim");

      const createTurn = vi.fn(async () => ({
        id: "tf_continuation",
        session_id: "tf_sess_1",
        previous_turn_id: "tf_source",
        input: [
          {
            type: "user.tool_response" as const,
            thread_id: "thread_1",
            tool_call_id: "tc_1",
            content: `[[forgeroom:application_run_token=${claim.applicationRunToken}]]\n{"selectedRowId":"row_1"}`,
          },
        ],
        state: { status: "running" as const },
        created_at: "2026-08-26T00:00:00.000Z",
      }));
      const listTurns = vi.fn(async () => ({ turns: [], nextPageToken: null }));

      const result = await executeCreateOrReconcileTurn(
        {
          sql,
          client: { createTurn, listTurns },
          loadContext: (agentTurnId) => loadAgentTurnCreateContext(sql, agentTurnId),
        },
        {
          schemaVersion: 1,
          command_id: "cmd_component_continuation",
          name: "create_or_reconcile_turn",
          payload: {
            run_id: "run_1",
            run_step_id: "step_1",
            agent_turn_id: claim.agentTurnId,
            logical_thread_id: "thread_1",
            expected_turn_state: "acquiring",
            session_generation_id: "gen_1",
            expected_session_generation: 1,
            application_run_token: claim.applicationRunToken,
          },
        },
      );

      expect(result).toMatchObject({
        ok: true,
        trueforgeTurnId: "tf_continuation",
        created: true,
      });
      expect(createTurn).toHaveBeenCalledWith("tf_sess_1", {
        input: [
          {
            type: "user.tool_response",
            thread_id: "thread_1",
            tool_call_id: "tc_1",
            content: `[[forgeroom:application_run_token=${claim.applicationRunToken}]]\n{"selectedRowId":"row_1"}`,
          },
        ],
        previousTurnId: "tf_source",
        stream: false,
      });

      const [continued] = await sql<{ state: string; continued_at: string | null }[]>`
        SELECT state, continued_at
        FROM ui_component_interrupts
        WHERE id = ${interruptId}
      `;
      expect(continued?.state).toBe("continued");
      expect(continued?.continued_at).toBeTruthy();

      const [boundTurn] = await sql<{ trueforge_turn_id: string | null; state: string }[]>`
        SELECT trueforge_turn_id, state
        FROM agent_turns
        WHERE id = ${claim.agentTurnId}
      `;
      expect(boundTurn).toMatchObject({
        trueforge_turn_id: "tf_continuation",
        state: "streaming",
      });
    });
  }, 60_000);
});
