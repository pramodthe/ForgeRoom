import { describe, expect, it } from "vitest";
import { claimTurnQueueItem, enqueueTurnQueueItem } from "./turn-queue";
import {
  persistPauseGroupCapture,
  type PersistPauseGroupAction,
} from "./pause-group";
import {
  atomicSwapSessionGeneration,
  beginSessionRotation,
  completeSessionRotation,
  nextSessionRevisionOrdinal,
  recordMcpRotationOutcome,
} from "./session-rotation";
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

async function clearSeedTurn(sql: Parameters<typeof seedRuntime>[0]) {
  await sql`UPDATE agent_turns SET state = 'completed', completed_at = ${NOW} WHERE id = 'turn_1'`;
  await sql`
    UPDATE turn_queue_items
    SET state = 'completed', completed_at = ${NOW}, lease_owner = NULL, lease_expires_at = NULL
    WHERE id = 'q_1'
  `;
}

describe("session rotation", () => {
  it("blocks claims while rotating, swaps generation, rebinds normals, never migrates responses", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await clearSeedTurn(sql);

      const normal = await enqueueTurnQueueItem(sql, {
        id: "q_normal_rot",
        channelAgentSessionId: "cas_1",
        runStepId: "step_1",
        inputType: "normal",
      });
      const pause = await enqueueTurnQueueItem(sql, {
        id: "q_pause_rot",
        channelAgentSessionId: "cas_1",
        runStepId: "step_1",
        inputType: "pause_group_response",
        boundSessionGenerationId: "gen_1",
      });
      expect(normal.id).toBe("q_normal_rot");
      expect(pause.id).toBe("q_pause_rot");

      const begun = await beginSessionRotation(sql, {
        channelAgentSessionId: "cas_1",
        reason: "grant_remove",
        previousTools: ["GITHUB_GET_AN_ISSUE", "GITHUB_ADD_LABELS_TO_AN_ISSUE"],
        nextTools: ["GITHUB_GET_AN_ISSUE"],
        hasActiveTurn: false,
        mcpInFlightKnownTerminal: null,
        now: NOW,
      });
      expect(begun.isRestriction).toBe(true);
      expect(begun.previousGenerationId).toBe("gen_1");
      expect(begun.previousTrueforgeSessionId).toBe("tf_sess_1");

      // Claim the priority head (pause response) — rotating blocks before generation binding.
      const blocked = await claimTurnQueueItem(sql, {
        queueItemId: "q_pause_rot",
        workerId: "worker_1",
        leaseExpiresAt: "2099-01-01T00:00:00.000Z",
        now: NOW,
      });
      expect(blocked).toEqual({ ok: false, reason: "session_rotating" });

      const ordinal = await nextSessionRevisionOrdinal(sql, "cw_1");
      expect(ordinal).toBe(2);

      const swap = await atomicSwapSessionGeneration(sql, {
        channelAgentSessionId: "cas_1",
        previousGenerationId: "gen_1",
        staleUnresolvedActions: false,
        now: NOW,
        revision: {
          id: "sr_rot_2",
          agentProfileId: "cw_1",
          sourceConfigRevision: ordinal,
          effectiveConfigRedactedJson: { tools: ["GITHUB_GET_AN_ISSUE"] },
          effectiveSpecHash: `sha256:${"cd".repeat(32)}`,
          approvalPolicyHash: `sha256:${"ef".repeat(32)}`,
          createdBy: "user_1",
          createdAt: NOW,
        },
        generation: {
          id: "gen_2",
          channelAgentSessionId: "cas_1",
          generation: begun.previousGeneration + 1,
          agentVersionId: "av_1",
          sessionRevisionId: "sr_rot_2",
          trueforgeSessionId: "tf_sess_2",
          effectiveSpecHash: `sha256:${"cd".repeat(32)}`,
          approvalPolicyHash: `sha256:${"ef".repeat(32)}`,
          state: "ready",
          createdAt: NOW,
          retiredAt: null,
        },
      });

      expect(swap.retainedOldTrueforgeSessionId).toBe("tf_sess_1");
      expect(swap.reboundNormalQueueItemIds).toContain("q_normal_rot");
      expect(swap.responseIntentsLeftBound).toContain("q_pause_rot");

      const [oldGen] = await sql<
        { trueforge_session_id: string; state: string; effective_spec_hash: string }[]
      >`
        SELECT trueforge_session_id, state, effective_spec_hash
        FROM channel_agent_session_generations
        WHERE id = 'gen_1'
      `;
      expect(oldGen).toEqual({
        trueforge_session_id: "tf_sess_1",
        state: "retired",
        effective_spec_hash: HASH,
      });

      const [session] = await sql<{ current_generation_id: string; state: string }[]>`
        SELECT current_generation_id, state FROM channel_agent_sessions WHERE id = 'cas_1'
      `;
      expect(session?.current_generation_id).toBe("gen_2");
      expect(session?.state).toBe("rotating");

      await completeSessionRotation(sql, { channelAgentSessionId: "cas_1", now: NOW });

      const [active] = await sql<{ state: string }[]>`
        SELECT state FROM channel_agent_sessions WHERE id = 'cas_1'
      `;
      expect(active?.state).toBe("active");

      const stalePauseClaim = await claimTurnQueueItem(sql, {
        queueItemId: "q_pause_rot",
        workerId: "worker_1",
        leaseExpiresAt: "2099-01-01T00:00:00.000Z",
        now: NOW,
      });
      expect(stalePauseClaim).toEqual({ ok: false, reason: "stale_generation" });

      // Old generation cannot accept new work: still retired after swap.
      await expect(
        sql`
          UPDATE channel_agent_session_generations
          SET state = 'ready', retired_at = NULL
          WHERE id = 'gen_1'
        `,
      ).rejects.toThrow(/retired|immutable|reopened/i);
    });
  }, 60_000);

  it("stales unresolved proposals on grant-remove / policy-tighten", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await clearSeedTurn(sql);

      const approval: PersistPauseGroupAction = {
        actionType: "approval",
        providerActionId: "prov_rot_approval",
        payloadRedacted: {
          type: "approval",
          toolName: "GITHUB_ADD_LABELS_TO_AN_ISSUE",
          toolCallId: "tc_rot",
        },
        payloadHash: PAYLOAD_HASH,
        proposal: {
          toolCallId: "tc_rot",
          toolName: "GITHUB_ADD_LABELS_TO_AN_ISSUE",
          observedDescriptorHash: HASH,
          riskClass: "medium",
          expectedEffect: "Add labels",
          normalizedArgumentsRedacted: { owner: "o", repo: "r", issue_number: 1, labels: ["x"] },
          argumentsHash: ARG_HASH,
          targetRedacted: {
            kind: "github_issue",
            owner: "o",
            repo: "r",
            issueNumber: 1,
            display: "o/r#1",
          },
          targetHash: TARGET_HASH,
          artifactRevisionHash: null,
          providerIdempotencyKey: null,
        },
      };

      await sql`
        INSERT INTO turn_queue_items (
          id, channel_agent_session_id, run_step_id, bound_session_generation_id, input_type,
          input_payload_redacted_json, fifo_sequence, state, created_at
        ) VALUES (
          'q_rot_pause', 'cas_1', 'step_1', 'gen_1', 'normal', '{}'::jsonb, 10, 'claimed', ${NOW}
        )
      `;
      await sql`
        INSERT INTO agent_turns (
          id, run_step_id, channel_agent_session_id, session_generation_id, queue_item_id,
          application_run_token, agui_run_id, input_type, state, trueforge_turn_id, started_at
        ) VALUES (
          'turn_rot', 'step_1', 'cas_1', 'gen_1', 'q_rot_pause', 'token_rot', 'agui_rot',
          'normal', 'streaming', 'tf_turn_rot', ${NOW}
        )
      `;

      const persisted = await persistPauseGroupCapture(sql, {
        agentTurnId: "turn_rot",
        trueforgeTurnId: "tf_turn_rot",
        generation: 1,
        actions: [approval],
        runStepState: "awaiting_approval",
        connectorBindingId: "cb_1",
        actingIdentityJson: ACTING,
        approvalPolicyHash: HASH,
        now: NOW,
      });
      expect(persisted.ok).toBe(true);

      const begun = await beginSessionRotation(sql, {
        channelAgentSessionId: "cas_1",
        reason: "policy_tighten",
        previousTools: ["GITHUB_GET_AN_ISSUE", "GITHUB_ADD_LABELS_TO_AN_ISSUE"],
        nextTools: ["GITHUB_GET_AN_ISSUE"],
        hasActiveTurn: true,
        mcpInFlightKnownTerminal: false,
        now: NOW,
      });
      expect(begun.requestActiveTurnCancellation).toBe(true);
      expect(begun.staleUnresolvedActions).toBe(true);

      const ordinal = await nextSessionRevisionOrdinal(sql, "cw_1");
      const swap = await atomicSwapSessionGeneration(sql, {
        channelAgentSessionId: "cas_1",
        previousGenerationId: "gen_1",
        staleUnresolvedActions: true,
        now: NOW,
        revision: {
          id: "sr_rot_policy",
          agentProfileId: "cw_1",
          sourceConfigRevision: ordinal,
          effectiveConfigRedactedJson: { tools: ["GITHUB_GET_AN_ISSUE"] },
          effectiveSpecHash: `sha256:${"aa".repeat(32)}`,
          approvalPolicyHash: `sha256:${"bb".repeat(32)}`,
          createdBy: "user_1",
          createdAt: NOW,
        },
        generation: {
          id: "gen_policy",
          channelAgentSessionId: "cas_1",
          generation: 2,
          agentVersionId: "av_1",
          sessionRevisionId: "sr_rot_policy",
          trueforgeSessionId: "tf_sess_policy",
          effectiveSpecHash: `sha256:${"aa".repeat(32)}`,
          approvalPolicyHash: `sha256:${"bb".repeat(32)}`,
          state: "ready",
          createdAt: NOW,
          retiredAt: null,
        },
      });

      expect(swap.staleProposalIds.length).toBeGreaterThan(0);
      expect(swap.stalePauseGroupIds.length).toBeGreaterThan(0);

      const [proposal] = await sql<{ state: string }[]>`
        SELECT state FROM action_proposals WHERE session_generation_id = 'gen_1'
      `;
      expect(proposal?.state).toBe("stale");

      await completeSessionRotation(sql, { channelAgentSessionId: "cas_1", now: NOW });
    });
  }, 60_000);

  it("reconciles active-MCP outcome without claim denial on account-revoke", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await clearSeedTurn(sql);

      await beginSessionRotation(sql, {
        channelAgentSessionId: "cas_1",
        reason: "account_revoke",
        previousTools: ["GITHUB_GET_AN_ISSUE"],
        nextTools: [],
        hasActiveTurn: true,
        mcpInFlightKnownTerminal: false,
        now: NOW,
      });

      // Restore a streaming turn for MCP reconcile.
      await sql`
        INSERT INTO turn_queue_items (
          id, channel_agent_session_id, run_step_id, bound_session_generation_id, input_type,
          input_payload_redacted_json, fifo_sequence, state, created_at
        ) VALUES (
          'q_mcp', 'cas_1', 'step_1', 'gen_1', 'normal', '{}'::jsonb, 20, 'claimed', ${NOW}
        )
      `;
      await sql`
        INSERT INTO agent_turns (
          id, run_step_id, channel_agent_session_id, session_generation_id, queue_item_id,
          application_run_token, agui_run_id, input_type, state, started_at
        ) VALUES (
          'turn_mcp', 'step_1', 'cas_1', 'gen_1', 'q_mcp', 'token_mcp', 'agui_mcp',
          'normal', 'streaming', ${NOW}
        )
      `;

      const recorded = await recordMcpRotationOutcome(sql, {
        channelAgentSessionId: "cas_1",
        agentTurnId: "turn_mcp",
        knownTerminal: false,
        now: NOW,
      });
      expect(recorded.denyByClaim).toBe(false);
      expect(recorded.outcome).toEqual({
        kind: "unknown",
        honest: true,
        needsAttention: true,
      });

      const [turn] = await sql<{ state: string }[]>`
        SELECT state FROM agent_turns WHERE id = 'turn_mcp'
      `;
      expect(turn?.state).toBe("uncertain");

      const ordinal = await nextSessionRevisionOrdinal(sql, "cw_1");
      await atomicSwapSessionGeneration(sql, {
        channelAgentSessionId: "cas_1",
        previousGenerationId: "gen_1",
        staleUnresolvedActions: true,
        now: NOW,
        revision: {
          id: "sr_rot_acct",
          agentProfileId: "cw_1",
          sourceConfigRevision: ordinal,
          effectiveConfigRedactedJson: { tools: [] },
          effectiveSpecHash: `sha256:${"11".repeat(32)}`,
          approvalPolicyHash: `sha256:${"22".repeat(32)}`,
          createdBy: "user_1",
          createdAt: NOW,
        },
        generation: {
          id: "gen_acct",
          channelAgentSessionId: "cas_1",
          generation: 2,
          agentVersionId: "av_1",
          sessionRevisionId: "sr_rot_acct",
          trueforgeSessionId: "tf_sess_acct",
          effectiveSpecHash: `sha256:${"11".repeat(32)}`,
          approvalPolicyHash: `sha256:${"22".repeat(32)}`,
          state: "ready",
          createdAt: NOW,
          retiredAt: null,
        },
      });
      await completeSessionRotation(sql, { channelAgentSessionId: "cas_1", now: NOW });
    });
  }, 60_000);

  it("grant-add rotates with a new revision without cancelling when tools only expand", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await clearSeedTurn(sql);

      const begun = await beginSessionRotation(sql, {
        channelAgentSessionId: "cas_1",
        reason: "grant_add",
        previousTools: ["GITHUB_GET_AN_ISSUE"],
        nextTools: ["GITHUB_GET_AN_ISSUE", "GITHUB_ADD_LABELS_TO_AN_ISSUE"],
        hasActiveTurn: true,
        mcpInFlightKnownTerminal: null,
        now: NOW,
      });
      expect(begun.isRestriction).toBe(false);
      expect(begun.requestActiveTurnCancellation).toBe(false);
      expect(begun.staleUnresolvedActions).toBe(false);

      const ordinal = await nextSessionRevisionOrdinal(sql, "cw_1");
      const swap = await atomicSwapSessionGeneration(sql, {
        channelAgentSessionId: "cas_1",
        previousGenerationId: "gen_1",
        staleUnresolvedActions: false,
        now: NOW,
        revision: {
          id: "sr_rot_add",
          agentProfileId: "cw_1",
          sourceConfigRevision: ordinal,
          effectiveConfigRedactedJson: {
            tools: ["GITHUB_GET_AN_ISSUE", "GITHUB_ADD_LABELS_TO_AN_ISSUE"],
          },
          effectiveSpecHash: `sha256:${"33".repeat(32)}`,
          approvalPolicyHash: `sha256:${"44".repeat(32)}`,
          createdBy: "user_1",
          createdAt: NOW,
        },
        generation: {
          id: "gen_add",
          channelAgentSessionId: "cas_1",
          generation: 2,
          agentVersionId: "av_1",
          sessionRevisionId: "sr_rot_add",
          trueforgeSessionId: "tf_sess_add",
          effectiveSpecHash: `sha256:${"33".repeat(32)}`,
          approvalPolicyHash: `sha256:${"44".repeat(32)}`,
          state: "ready",
          createdAt: NOW,
          retiredAt: null,
        },
      });
      expect(swap.staleProposalIds).toEqual([]);
      expect(swap.newGenerationId).toBe("gen_add");
      await completeSessionRotation(sql, { channelAgentSessionId: "cas_1", now: NOW });
    });
  }, 60_000);
});
