import { describe, expect, it } from "vitest";
import { claimTurnQueueItem, enqueueTurnQueueItem } from "./turn-queue";
import {
  persistPauseGroupCapture,
  sessionHasUnresolvedPauseGroup,
  type PersistPauseGroupAction,
} from "./pause-group";
import { HASH, NOW, seedRuntime, withMigratedDatabase } from "./test-harness";

const ACTING = {
  service: "github",
  account_display: "fixture-org",
  principal_type: "bot",
  principal_display: "fixture-bot",
  principal_id_hash: HASH,
};

const ARG_HASH = `sha256:${"11".repeat(32)}`;
const TARGET_HASH = `sha256:${"22".repeat(32)}`;
const PAYLOAD_HASH = `sha256:${"33".repeat(32)}`;
const PROMPT_HASH = `sha256:${"44".repeat(32)}`;

const mixedActions: PersistPauseGroupAction[] = [
  {
    actionType: "approval",
    providerActionId: "prov_approval",
    payloadRedacted: {
      type: "approval",
      toolName: "GITHUB_ADD_LABELS_TO_AN_ISSUE",
      toolCallId: "tc_write",
      target: {
        kind: "github_issue",
        owner: "pramodthe",
        repo: "ForgeRoom",
        issueNumber: 35,
        display: "pramodthe/ForgeRoom#35",
      },
      arguments: {
        owner: "pramodthe",
        repo: "ForgeRoom",
        issue_number: 35,
        labels: ["forgeroom-p0-probe"],
      },
      expectedEffect: "Add labels to issue",
      riskClass: "medium",
    },
    payloadHash: PAYLOAD_HASH,
    proposal: {
      toolCallId: "tc_write",
      toolName: "GITHUB_ADD_LABELS_TO_AN_ISSUE",
      observedDescriptorHash: HASH,
      riskClass: "medium",
      expectedEffect: "Add labels to issue",
      normalizedArgumentsRedacted: {
        owner: "pramodthe",
        repo: "ForgeRoom",
        issue_number: 35,
        labels: ["forgeroom-p0-probe"],
      },
      argumentsHash: ARG_HASH,
      targetRedacted: {
        kind: "github_issue",
        owner: "pramodthe",
        repo: "ForgeRoom",
        issueNumber: 35,
        display: "pramodthe/ForgeRoom#35",
      },
      targetHash: TARGET_HASH,
      artifactRevisionHash: null,
      providerIdempotencyKey: null,
    },
  },
  {
    actionType: "question",
    providerActionId: "prov_question",
    payloadRedacted: { type: "question", prompt: { prompt: "Confirm the label?" } },
    payloadHash: PROMPT_HASH,
    promptRedacted: { prompt: "Confirm the label?" },
    promptHash: PROMPT_HASH,
  },
];

async function prepareStreamingTurn(sql: Parameters<typeof seedRuntime>[0]) {
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
    )
    VALUES ('q_pg', 'cas_1', 'step_1', 'gen_1', 'normal', '{}'::jsonb, 10, 'claimed', ${NOW})
  `;
  await sql`
    INSERT INTO agent_turns (
      id, run_step_id, channel_agent_session_id, session_generation_id, queue_item_id,
      application_run_token, agui_run_id, input_type, state, trueforge_turn_id, started_at
    )
    VALUES (
      'turn_pg', 'step_1', 'cas_1', 'gen_1', 'q_pg',
      'art_pg', 'agui_pg', 'normal', 'streaming', 'tf_turn_pg', ${NOW}
    )
  `;
}

describe("PauseGroup persistence", () => {
  it("captures mixed approval/question once, keeps RunStep nonterminal, and is restart-idempotent", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await prepareStreamingTurn(sql);

      const first = await persistPauseGroupCapture(sql, {
        agentTurnId: "turn_pg",
        trueforgeTurnId: "tf_turn_pg",
        generation: 1,
        actions: mixedActions,
        runStepState: "awaiting_approval",
        connectorBindingId: "cb_1",
        actingIdentityJson: ACTING,
        approvalPolicyHash: HASH,
        now: NOW,
      });
      expect(first.ok).toBe(true);
      if (!first.ok) throw new Error("persist");
      expect(first.inserted).toBe(true);
      expect(first.requiredActionIds).toHaveLength(2);
      expect(first.actionProposalIds).toHaveLength(1);
      expect(first.questionIds).toHaveLength(1);

      const second = await persistPauseGroupCapture(sql, {
        agentTurnId: "turn_pg",
        trueforgeTurnId: "tf_turn_pg",
        generation: 1,
        actions: mixedActions,
        runStepState: "awaiting_approval",
        connectorBindingId: "cb_1",
        actingIdentityJson: ACTING,
        approvalPolicyHash: HASH,
        now: NOW,
      });
      expect(second.ok).toBe(true);
      if (!second.ok) throw new Error("repersist");
      expect(second.inserted).toBe(false);
      expect(second.pauseGroupId).toBe(first.pauseGroupId);
      expect(second.requiredActionIds).toEqual(first.requiredActionIds);

      const groups = await sql<
        { id: string; generation: number; state: string; required_action_count: number }[]
      >`
        SELECT id, generation, state, required_action_count
        FROM pause_groups WHERE agent_turn_id = 'turn_pg'
      `;
      expect(groups).toHaveLength(1);
      expect(groups[0]).toMatchObject({
        generation: 1,
        state: "collecting",
        required_action_count: 2,
      });

      const turn = await sql<{ state: string }[]>`
        SELECT state FROM agent_turns WHERE id = 'turn_pg'
      `;
      expect(turn[0]?.state).toBe("required_actions");
      const step = await sql<{ state: string; completed_at: string | Date | null }[]>`
        SELECT state, completed_at FROM run_steps WHERE id = 'step_1'
      `;
      expect(step[0]?.state).toBe("awaiting_approval");
      expect(step[0]?.completed_at).toBeNull();
      const queue = await sql<{ state: string; lease_owner: string | null }[]>`
        SELECT state, lease_owner FROM turn_queue_items WHERE id = 'q_pg'
      `;
      expect(queue[0]).toEqual({ state: "completed", lease_owner: null });

      const proposal = await sql<
        {
          tool_name: string;
          arguments_hash: string;
          target_hash: string;
          observed_descriptor_hash: string;
          approval_policy_hash: string;
          session_generation_id: string;
          normalized_arguments_redacted_json: Record<string, unknown>;
        }[]
      >`
        SELECT tool_name, arguments_hash, target_hash, observed_descriptor_hash,
               approval_policy_hash, session_generation_id, normalized_arguments_redacted_json
        FROM action_proposals WHERE id = ${first.actionProposalIds[0]!}
      `;
      expect(proposal[0]?.tool_name).toBe("GITHUB_ADD_LABELS_TO_AN_ISSUE");
      expect(proposal[0]?.arguments_hash).toBe(ARG_HASH);
      expect(proposal[0]?.target_hash).toBe(TARGET_HASH);
      expect(proposal[0]?.observed_descriptor_hash).toBe(HASH);
      expect(proposal[0]?.approval_policy_hash).toBe(HASH);
      expect(proposal[0]?.session_generation_id).toBe("gen_1");
      expect(JSON.stringify(proposal[0]?.normalized_arguments_redacted_json)).not.toContain(
        "access_token",
      );
      expect(JSON.stringify(proposal[0]?.normalized_arguments_redacted_json)).toContain(
        "forgeroom-p0-probe",
      );

      expect(await sessionHasUnresolvedPauseGroup(sql, "cas_1")).toBe(true);
    });
  }, 60_000);

  it("blocks normal claims while unresolved and allows pause_group_response", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await prepareStreamingTurn(sql);

      const persisted = await persistPauseGroupCapture(sql, {
        agentTurnId: "turn_pg",
        trueforgeTurnId: "tf_turn_pg",
        generation: 1,
        actions: [mixedActions[0]!],
        runStepState: "awaiting_approval",
        connectorBindingId: "cb_1",
        actingIdentityJson: ACTING,
        approvalPolicyHash: HASH,
        now: NOW,
      });
      expect(persisted.ok).toBe(true);
      if (!persisted.ok) throw new Error("persist");

      await enqueueTurnQueueItem(sql, {
        id: "q_normal_blocked",
        channelAgentSessionId: "cas_1",
        runStepId: "step_1",
        inputType: "normal",
        inputPayloadRedacted: { text: "follow up" },
      });
      const blocked = await claimTurnQueueItem(sql, {
        queueItemId: "q_normal_blocked",
        workerId: "worker_1",
        leaseExpiresAt: "2026-08-25T23:05:00.000Z",
        now: NOW,
      });
      expect(blocked).toEqual({ ok: false, reason: "pause_group_unresolved" });

      await enqueueTurnQueueItem(sql, {
        id: "q_pause_ok",
        channelAgentSessionId: "cas_1",
        runStepId: "step_1",
        inputType: "pause_group_response",
        boundSessionGenerationId: "gen_1",
        inputPayloadRedacted: { pause_group_id: persisted.pauseGroupId },
      });
      const allowed = await claimTurnQueueItem(sql, {
        queueItemId: "q_pause_ok",
        workerId: "worker_1",
        leaseExpiresAt: "2026-08-25T23:05:00.000Z",
        now: NOW,
      });
      expect(allowed.ok).toBe(true);
    });
  }, 60_000);

  it("persists connection actions as blocked_connection and enforces unique provider actions", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await prepareStreamingTurn(sql);

      const connectionAction: PersistPauseGroupAction = {
        actionType: "connection",
        providerActionId: "prov_conn",
        payloadRedacted: {
          type: "connection",
          connector: "composio_github",
          reason: "expired",
        },
        payloadHash: PAYLOAD_HASH,
      };

      const first = await persistPauseGroupCapture(sql, {
        agentTurnId: "turn_pg",
        trueforgeTurnId: "tf_turn_pg",
        generation: 1,
        actions: [connectionAction],
        runStepState: "blocked_connection",
        connectorBindingId: "cb_1",
        actingIdentityJson: ACTING,
        approvalPolicyHash: HASH,
        now: NOW,
      });
      expect(first.ok && first.inserted).toBe(true);
      if (!first.ok) throw new Error("persist");

      const step = await sql<{ state: string; completed_at: string | Date | null }[]>`
        SELECT state, completed_at FROM run_steps WHERE id = 'step_1'
      `;
      expect(step[0]?.state).toBe("blocked_connection");
      expect(step[0]?.completed_at).toBeNull();

      await expect(
        sql`
          INSERT INTO required_actions (
            id, pause_group_id, provider_action_id, action_type, state,
            payload_redacted_json, payload_hash, created_at
          ) VALUES (
            'ra_dup_force', ${first.pauseGroupId}, 'prov_conn',
            'connection', 'pending', '{}'::jsonb, ${HASH}, ${NOW}
          )
        `,
      ).rejects.toThrow(/required_actions_provider_uidx|unique/i);
    });
  }, 60_000);
});
