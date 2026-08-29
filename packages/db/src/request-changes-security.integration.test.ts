import { describe, expect, it } from "vitest";
import { recordApprovalDecision } from "./approval-decision";
import { loadAgentTurnCreateContext } from "./agent-turn-create-context";
import { derivePausePayloadKey } from "./pause-crypto";
import { persistPauseGroupCapture } from "./pause-group";
import { HASH, NOW, seedRuntime, withMigratedDatabase } from "./test-harness";
import {
  bindTrueForgeTurnId,
  ingestNormalizedTrueForgeEvent,
  lockAgentTurnForCreate,
} from "./turn-lifecycle";
import { claimTurnQueueItem, enqueueTurnQueueItem } from "./turn-queue";

const KEY = derivePausePayloadKey("request-changes-security-test");
const ARG_HASH = `sha256:${"11".repeat(32)}`;
const TARGET_HASH = `sha256:${"22".repeat(32)}`;
const PROMPT_HASH = `sha256:${"33".repeat(32)}`;
const SENSITIVE_REASON = "Use label private-customer-codename instead";

describe("request_changes correction boundary", () => {
  it("keeps the reason encrypted and claims only its linked correction", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await sql`UPDATE agent_turns SET state = 'completed', completed_at = ${NOW} WHERE id = 'turn_1'`;
      await sql`
        UPDATE turn_queue_items
        SET state = 'completed', completed_at = ${NOW}, lease_owner = NULL, lease_expires_at = NULL
        WHERE id = 'q_1'
      `;
      await sql`
        INSERT INTO turn_queue_items (
          id, channel_agent_session_id, run_step_id, bound_session_generation_id, input_type,
          input_payload_redacted_json, fifo_sequence, state, created_at
        ) VALUES (
          'q_request_changes_source', 'cas_1', 'step_1', 'gen_1', 'normal', '{}'::jsonb,
          10, 'claimed', ${NOW}
        )
      `;
      await sql`
        INSERT INTO agent_turns (
          id, run_step_id, channel_agent_session_id, session_generation_id, queue_item_id,
          application_run_token, agui_run_id, input_type, state, trueforge_turn_id, started_at
        ) VALUES (
          'turn_request_changes', 'step_1', 'cas_1', 'gen_1', 'q_request_changes_source',
          'art_request_changes', 'agui_request_changes', 'normal', 'streaming',
          'tf_request_changes', ${NOW}
        )
      `;

      const captured = await persistPauseGroupCapture(sql, {
        agentTurnId: "turn_request_changes",
        trueforgeTurnId: "tf_request_changes",
        generation: 1,
        actions: [
          {
            actionType: "approval",
            providerActionId: "provider_request_changes",
            payloadRedacted: {
              type: "approval",
              toolName: "GITHUB_ADD_LABELS_TO_AN_ISSUE",
              toolCallId: "tc_request_changes",
            },
            payloadHash: HASH,
            proposal: {
              toolCallId: "tc_request_changes",
              toolName: "GITHUB_ADD_LABELS_TO_AN_ISSUE",
              observedDescriptorHash: HASH,
              riskClass: "medium",
              expectedEffect: "Add labels",
              normalizedArgumentsRedacted: { labels: ["safe"] },
              argumentsHash: ARG_HASH,
              targetRedacted: { display: "org/repo#1" },
              targetHash: TARGET_HASH,
              artifactRevisionHash: null,
              providerIdempotencyKey: null,
            },
          },
          {
            actionType: "question",
            providerActionId: "provider_request_changes_sibling_question",
            payloadRedacted: { type: "question", prompt: "Continue with the original action?" },
            payloadHash: PROMPT_HASH,
            promptRedacted: { prompt: "Continue with the original action?" },
            promptHash: PROMPT_HASH,
          },
        ],
        runStepState: "awaiting_approval",
        connectorBindingId: "cb_1",
        actingIdentityJson: {
          service: "github",
          account_display: "fixture-org",
          principal_type: "bot",
          principal_display: "fixture-bot",
          principal_id_hash: HASH,
        },
        approvalPolicyHash: HASH,
        now: NOW,
      });
      if (!captured.ok) throw new Error(`capture failed: ${captured.reason}`);

      const decided = await recordApprovalDecision(sql, {
        proposalId: captured.actionProposalIds[0]!,
        workspaceId: "ws_1",
        actorUserId: "user_1",
        encryptionKey: KEY,
        command: {
          decision: "request_changes",
          expected_arguments_hash: ARG_HASH,
          expected_descriptor_hash: HASH,
          expected_session_generation: 1,
          reason: SENSITIVE_REASON,
        },
        now: NOW,
      });
      if (!decided.ok || !decided.correctionDraft) throw new Error("decision failed");
      expect(decided.correctionDraft.content).toBe("[REDACTED]");

      const persistedProjection = await sql<Array<{ projection: string }>>`
        SELECT concat_ws(' ',
          COALESCE(ap.decision_reason, ''),
          COALESCE(ra.response_redacted_json::text, ''),
          COALESCE(rs.objective, ''),
          COALESCE(rs.context_refs_json::text, ''),
          COALESCE(q.input_payload_redacted_json::text, ''),
          COALESCE((SELECT string_agg(redacted_payload_json::text, ' ') FROM audit_events), ''),
          COALESCE((SELECT string_agg(normalized_payload_redacted_json::text, ' ') FROM run_events), '')
        ) AS projection
        FROM action_proposals AS ap
        JOIN required_actions AS ra ON ra.id = ap.required_action_id
        JOIN turn_queue_items AS q ON q.id = ${decided.correctionDraft.queueItemId}
        JOIN run_steps AS rs ON rs.id = q.run_step_id
        WHERE ap.id = ${decided.proposalId}
      `;
      expect(persistedProjection[0]?.projection).not.toContain(SENSITIVE_REASON);

      await sql`
        INSERT INTO run_steps (
          id, run_id, assigned_agent_id, objective, context_refs_json, state, attempt
        )
        SELECT
          'step_unrelated_after_correction', run_id, assigned_agent_id,
          'Unrelated later work', '[]'::jsonb, 'queued', 1
        FROM run_steps
        WHERE id = 'step_1'
      `;

      const unrelated = await enqueueTurnQueueItem(sql, {
        id: "q_unrelated_during_pause",
        channelAgentSessionId: "cas_1",
        runStepId: "step_unrelated_after_correction",
        inputType: "normal",
      });
      await sql`UPDATE turn_queue_items SET priority = 200 WHERE id = ${unrelated.id}`;
      expect(
        await claimTurnQueueItem(sql, {
          queueItemId: unrelated.id,
          workerId: "worker_unrelated",
          leaseExpiresAt: "2099-01-01T00:00:00.000Z",
          now: NOW,
        }),
      ).toEqual({ ok: false, reason: "pause_group_unresolved" });
      await sql`UPDATE turn_queue_items SET priority = 0 WHERE id = ${unrelated.id}`;

      const correctionQueue = await sql<Array<{ queue_payload: Record<string, unknown> }>>`
        SELECT input_payload_redacted_json AS queue_payload
        FROM turn_queue_items
        WHERE id = ${decided.correctionDraft.queueItemId}
      `;
      expect(correctionQueue[0]!.queue_payload).toEqual(
        expect.objectContaining({
          pause_group_id: captured.pauseGroupId,
          required_action_id: captured.requiredActionIds[0],
        }),
      );
      const correctionBinding = await sql<
        Array<{
          queue_payload: Record<string, unknown>;
          pause_state: string;
          action_state: string;
          request_changes: string | null;
          source_session_id: string;
        }>
      >`
        SELECT
          q.input_payload_redacted_json AS queue_payload,
          pg.state AS pause_state,
          ra.state AS action_state,
          ra.response_redacted_json->>'request_changes' AS request_changes,
          source_turn.channel_agent_session_id AS source_session_id
        FROM turn_queue_items AS q
        JOIN required_actions AS ra ON ra.id = ${captured.requiredActionIds[0]!}
        JOIN pause_groups AS pg ON pg.id = ra.pause_group_id
        JOIN agent_turns AS source_turn ON source_turn.id = pg.agent_turn_id
        WHERE q.id = ${decided.correctionDraft.queueItemId}
      `;
      expect(correctionBinding).toEqual([
        expect.objectContaining({
          pause_state: "collecting",
          action_state: "resolved",
          request_changes: "true",
          source_session_id: "cas_1",
        }),
      ]);

      const claimed = await claimTurnQueueItem(sql, {
        queueItemId: decided.correctionDraft.queueItemId,
        workerId: "worker_correction",
        leaseExpiresAt: "2099-01-01T00:00:00.000Z",
        now: NOW,
      });
      if (!claimed.ok) throw new Error(`claim failed: ${claimed.reason}`);

      expect(
        await loadAgentTurnCreateContext(
          sql,
          claimed.agentTurnId,
          derivePausePayloadKey("wrong-key"),
        ),
      ).toBeNull();
      const context = await loadAgentTurnCreateContext(sql, claimed.agentTurnId, KEY);
      expect(context).toMatchObject({
        kind: "normal",
        inputType: "correction",
        content: SENSITIVE_REASON,
        previousTrueforgeTurnId: "tf_request_changes",
      });

      const terminalized = await sql<
        Array<{
          pause_state: string;
          source_turn_state: string;
          source_step_state: string;
          sibling_action_state: string;
          sibling_question_state: string;
        }>
      >`
        SELECT
          pg.state AS pause_state,
          source_turn.state AS source_turn_state,
          source_step.state AS source_step_state,
          sibling.state AS sibling_action_state,
          q.state AS sibling_question_state
        FROM pause_groups AS pg
        JOIN agent_turns AS source_turn ON source_turn.id = pg.agent_turn_id
        JOIN run_steps AS source_step ON source_step.id = source_turn.run_step_id
        JOIN required_actions AS sibling
          ON sibling.pause_group_id = pg.id
          AND sibling.action_type = 'question'
        JOIN questions AS q ON q.required_action_id = sibling.id
        WHERE pg.id = ${captured.pauseGroupId}
      `;
      expect(terminalized).toEqual([
        {
          pause_state: "cancelled",
          source_turn_state: "cancelled",
          source_step_state: "cancelled",
          sibling_action_state: "cancelled",
          sibling_question_state: "stale",
        },
      ]);

      expect(
        await claimTurnQueueItem(sql, {
          queueItemId: unrelated.id,
          workerId: "worker_unrelated_while_correction_runs",
          leaseExpiresAt: "2099-01-01T00:00:00.000Z",
          now: NOW,
        }),
      ).toEqual({ ok: false, reason: "session_busy" });

      expect(await lockAgentTurnForCreate(sql, { agentTurnId: claimed.agentTurnId })).toMatchObject(
        {
          ok: true,
        },
      );
      expect(
        await bindTrueForgeTurnId(sql, {
          agentTurnId: claimed.agentTurnId,
          trueforgeTurnId: "tf_request_changes_correction",
          previousTrueforgeTurnId: "tf_request_changes",
          bindingSource: "create_response",
          now: NOW,
        }),
      ).toEqual({ ok: true });
      expect(
        await ingestNormalizedTrueForgeEvent(sql, {
          agentTurnId: claimed.agentTurnId,
          expectedTurnStates: ["streaming"],
          event: {
            trueforgeEventId: "tf_request_changes_correction:done",
            normalizedType: "turn.done",
            threadId: null,
            sequenceNumber: 1,
            payloadRedacted: { state: "completed" },
          },
          turnDoneOutcome: {
            kind: "terminal_success",
            agentTurnState: "completed",
            runStepState: "completed",
            requiredActionCount: 0,
          },
          now: NOW,
        }),
      ).toMatchObject({ ok: true });

      expect(
        await claimTurnQueueItem(sql, {
          queueItemId: unrelated.id,
          workerId: "worker_unrelated_after_correction",
          leaseExpiresAt: "2099-01-01T00:00:00.000Z",
          now: NOW,
        }),
      ).toMatchObject({ ok: true });
    });
  }, 60_000);
});
