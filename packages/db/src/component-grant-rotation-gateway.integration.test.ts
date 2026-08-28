import { describe, expect, it } from "vitest";
import { buildGrantScopePreimage, hashGrantScope } from "@forgeroom/domain";
import {
  brokerComponentToolMcpCall,
  loadComponentOfferContext,
  loadComponentToolGenerationContext,
} from "./component-tool-gateway";
import {
  atomicSwapSessionGeneration,
  beginSessionRotation,
  completeSessionRotation,
} from "./session-rotation";
import { claimTurnQueueItem, enqueueTurnQueueItem } from "./turn-queue";
import { HASH, NOW, seedRuntime, withMigratedDatabase } from "./test-harness";

async function clearSeedTurn(sql: Parameters<typeof seedRuntime>[0]): Promise<void> {
  await sql`UPDATE agent_turns SET state = 'completed', completed_at = ${NOW} WHERE id = 'turn_1'`;
  await sql`
    UPDATE turn_queue_items
    SET state = 'completed', completed_at = ${NOW}, lease_owner = NULL, lease_expires_at = NULL
    WHERE id = 'q_1'
  `;
}

async function seedOfferedDataTable(sql: Parameters<typeof seedRuntime>[0]): Promise<void> {
  await sql`
    INSERT INTO ui_component_grants (
      id, component_version_id, workspace_id, channel_id, agent_profile_id, granted_by, granted_at
    )
    VALUES ('cg_rot', 'compv_1', 'ws_1', NULL, 'cw_1', 'user_1', ${NOW})
  `;
  await sql`
    UPDATE session_revisions
    SET effective_config_redacted_json = ${sql.json({
      component_tool_names: ["ui.dataTable"],
    })}
    WHERE id = 'sr_1'
  `;
}

describe("component grant rotation gateway", () => {
  it("blocks queue claims during rotation and rejects stale broker generations after swap", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await clearSeedTurn(sql);
      await seedOfferedDataTable(sql);

      const normal = await enqueueTurnQueueItem(sql, {
        id: "q_rot_normal",
        channelAgentSessionId: "cas_1",
        runStepId: "step_1",
        inputType: "normal",
      });
      const continuation = await enqueueTurnQueueItem(sql, {
        id: "q_rot_component",
        channelAgentSessionId: "cas_1",
        runStepId: "step_1",
        inputType: "component_interaction_response",
        boundSessionGenerationId: "gen_1",
      });
      expect(normal.id).toBe("q_rot_normal");
      expect(continuation.id).toBe("q_rot_component");

      const begun = await beginSessionRotation(sql, {
        channelAgentSessionId: "cas_1",
        agentProfileId: "cw_1",
        reason: "component_revoke",
        previousTools: ["ui.dataTable"],
        nextTools: [],
        hasActiveTurn: false,
        mcpInFlightKnownTerminal: null,
        now: NOW,
      });
      expect(begun.isRestriction).toBe(true);
      expect(begun.staleUnresolvedActions).toBe(true);

      const blockedContinuation = await claimTurnQueueItem(sql, {
        queueItemId: "q_rot_component",
        workerId: "worker_1",
        leaseExpiresAt: "2099-01-01T00:00:00.000Z",
        now: NOW,
      });
      expect(blockedContinuation).toEqual({ ok: false, reason: "session_rotating" });

      const blockedNormal = await claimTurnQueueItem(sql, {
        queueItemId: "q_rot_normal",
        workerId: "worker_1",
        leaseExpiresAt: "2099-01-01T00:00:00.000Z",
        now: NOW,
      });
      expect(blockedNormal).toEqual({ ok: false, reason: "not_next" });

      const rotatingContext = await loadComponentToolGenerationContext(sql, "gen_1");
      expect(rotatingContext).toBeNull();

      const rotatingOffer = await loadComponentOfferContext(sql, {
        channelId: "ch_1",
        coworkerId: "cw_1",
        expectedSessionGeneration: 1,
        componentVersionId: "compv_1",
        expectedDescriptorHash: HASH,
        expectedGrantScopeHash: hashGrantScope(
          buildGrantScopePreimage({
            workspaceId: "ws_1",
            channelId: "ch_1",
            agentProfileId: "cw_1",
            componentVersionId: "compv_1",
          }),
        ),
      });
      expect(rotatingOffer).toEqual({
        ok: false,
        code: "session_rotating",
        message: "Session is rotating; queue claims and component offers are blocked.",
      });

      const swap = await atomicSwapSessionGeneration(sql, {
        channelAgentSessionId: "cas_1",
        previousGenerationId: "gen_1",
        staleUnresolvedActions: true,
        now: NOW,
        revision: {
          id: "sr_rot_component",
          agentProfileId: "cw_1",
          sourceConfigRevision: begun.sourceConfigRevision,
          effectiveConfigRedactedJson: { component_tool_names: [] },
          effectiveSpecHash: `sha256:${"aa".repeat(32)}`,
          approvalPolicyHash: `sha256:${"bb".repeat(32)}`,
          createdBy: "user_1",
          createdAt: NOW,
        },
        generation: {
          id: "gen_2",
          channelAgentSessionId: "cas_1",
          generation: 2,
          agentVersionId: "av_1",
          sessionRevisionId: "sr_rot_component",
          trueforgeSessionId: "tf_sess_2",
          effectiveSpecHash: `sha256:${"aa".repeat(32)}`,
          approvalPolicyHash: `sha256:${"bb".repeat(32)}`,
          state: "ready",
          createdAt: NOW,
          retiredAt: null,
        },
      });
      expect(swap.newGenerationId).toBe("gen_2");
      await completeSessionRotation(sql, { channelAgentSessionId: "cas_1", now: NOW });

      const staleContext = await loadComponentToolGenerationContext(sql, "gen_1");
      expect(staleContext).toBeNull();

      const staleOffer = await loadComponentOfferContext(sql, {
        channelId: "ch_1",
        coworkerId: "cw_1",
        expectedSessionGeneration: 1,
        componentVersionId: "compv_1",
        expectedDescriptorHash: HASH,
        expectedGrantScopeHash: hashGrantScope(
          buildGrantScopePreimage({
            workspaceId: "ws_1",
            channelId: "ch_1",
            agentProfileId: "cw_1",
            componentVersionId: "compv_1",
          }),
        ),
      });
      expect(staleOffer).toEqual({
        ok: false,
        code: "stale_generation",
        message: "Session generation does not match the offered tool revision.",
      });

      const brokered = await brokerComponentToolMcpCall(sql, {
        generationId: "gen_1",
        stableName: "DataTable",
        toolCallId: "tc_stale_gen",
        props: {
          caption: "Results",
          empty_text: "No rows",
          columns: [{ key: "id", label: "ID" }],
        },
        now: NOW,
      });
      expect(brokered).toMatchObject({
        status: "quarantined",
        instanceId: "",
        renderRevision: null,
      });
    });
  }, 60_000);

  it("stales waiting component interrupts when a component grant is revoked", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await clearSeedTurn(sql);
      await seedOfferedDataTable(sql);
      await sql`
        INSERT INTO ui_component_interrupts (
          id, ui_instance_id, run_id, run_step_id, agent_turn_id, logical_thread_id,
          tool_call_id, session_generation_id, action_grant_id, input_schema_hash, state, created_at
        )
        VALUES (
          'intr_rot', 'ui_1', 'run_1', 'step_1', 'turn_1', 'thread_1',
          'tc_interrupt', 'gen_1', 'ag_1', ${HASH}, 'waiting', ${NOW}
        )
      `;

      const begun = await beginSessionRotation(sql, {
        channelAgentSessionId: "cas_1",
        agentProfileId: "cw_1",
        reason: "component_revoke",
        previousTools: ["ui.dataTable"],
        nextTools: [],
        hasActiveTurn: false,
        mcpInFlightKnownTerminal: null,
        now: NOW,
      });
      await atomicSwapSessionGeneration(sql, {
        channelAgentSessionId: "cas_1",
        previousGenerationId: "gen_1",
        staleUnresolvedActions: true,
        now: NOW,
        revision: {
          id: "sr_rot_interrupt",
          agentProfileId: "cw_1",
          sourceConfigRevision: begun.sourceConfigRevision,
          effectiveConfigRedactedJson: { component_tool_names: [] },
          effectiveSpecHash: `sha256:${"cc".repeat(32)}`,
          approvalPolicyHash: `sha256:${"dd".repeat(32)}`,
          createdBy: "user_1",
          createdAt: NOW,
        },
        generation: {
          id: "gen_interrupt",
          channelAgentSessionId: "cas_1",
          generation: 2,
          agentVersionId: "av_1",
          sessionRevisionId: "sr_rot_interrupt",
          trueforgeSessionId: "tf_sess_interrupt",
          effectiveSpecHash: `sha256:${"cc".repeat(32)}`,
          approvalPolicyHash: `sha256:${"dd".repeat(32)}`,
          state: "ready",
          createdAt: NOW,
          retiredAt: null,
        },
      });
      await completeSessionRotation(sql, { channelAgentSessionId: "cas_1", now: NOW });

      const [interrupt] = await sql<{ state: string; stale_at: string | null }[]>`
        SELECT state, stale_at FROM ui_component_interrupts WHERE id = 'intr_rot'
      `;
      expect(interrupt?.state).toBe("stale");
      expect(interrupt?.stale_at).not.toBeNull();
    });
  }, 60_000);
});
