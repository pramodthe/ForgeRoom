import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalizeJson } from "@forgeroom/domain";
import { actionGrantSchema } from "@forgeroom/contracts";
import { commitUiInteraction, issueUiInteractionToken } from "./ui-interactions";
import {
  loadAgentTurnCreateContext,
  markComponentInterruptContinued,
} from "./agent-turn-create-context";
import { claimTurnQueueItem } from "./turn-queue";
import { HASH, NOW, seedRuntime, withMigratedDatabase } from "./test-harness";

const TEST_NOW = "2020-01-01T00:00:00.000Z";
const INTERACTION_TOKEN_SECRET = "test-interaction-token-secret";

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalizeJson(value), "utf8").digest("hex")}`;
}

describe("agent turn create context", () => {
  it("loads component continuation context after interrupt resolution and claim", async () => {
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

      const inputSchema = { type: "object", additionalProperties: false, properties: {} };
      const interruptId = "intr_ctx";
      const actionBody = actionGrantSchema.parse({
        schemaVersion: 1,
        id: "ag_complete",
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
          'uirev_ctx_0', 'ui_1', 'render', 0, 'compv_1', ${HASH},
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
      await sql`
        INSERT INTO ui_surface_grants (
          id, ui_instance_id, grant_kind, policy_revision, bound_render_revision, bound_manifest_hash,
          action_ref, handler_key, action_mode, input_schema_json, input_schema_hash,
          allowed_render_node_ids_json, component_interrupt_id, grant_body_redacted_json, grant_scope_hash,
          max_uses, use_count, issued_by, expires_at, created_at
        ) VALUES (
          'ag_complete_ctx', 'ui_1', 'action', 1, 0, ${HASH}, 'submit',
          'controlled_ui.complete_component_interrupt.v1', 'complete_component_interrupt',
          ${JSON.stringify(inputSchema)}::jsonb, ${sha256(inputSchema)}, '["node_1"]'::jsonb,
          ${interruptId}, ${JSON.stringify(actionBody)}::jsonb, ${HASH}, 1, 0,
          'application_policy', ${NOW}, ${NOW}
        )
      `;
      await sql`
        INSERT INTO ui_component_interrupts (
          id, ui_instance_id, run_id, run_step_id, agent_turn_id, logical_thread_id,
          tool_call_id, session_generation_id, action_grant_id, input_schema_hash, state, created_at
        ) VALUES (
          ${interruptId}, 'ui_1', 'run_1', 'step_1', 'turn_1', 'thread_1',
          'tc_1', 'gen_1', 'ag_complete_ctx', ${sha256(inputSchema)}, 'waiting', ${NOW}
        )
      `;

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
          actionGrantId: "ag_complete_ctx",
          actionRef: "submit",
          input: { selectedRowId: "row_1" },
          clientKind: "registry",
          idempotencyKey: "continuation-context-test",
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
        workerId: "worker_ctx",
        leaseExpiresAt: "2099-01-01T00:00:00.000Z",
        now: NOW,
      });
      expect(claim.ok).toBe(true);
      if (!claim.ok) throw new Error("expected claim");

      const context = await loadAgentTurnCreateContext(sql, claim.agentTurnId);
      expect(context).toMatchObject({
        kind: "component_continuation",
        inputType: "component_interaction_response",
        applicationRunToken: claim.applicationRunToken,
        previousTrueforgeTurnId: "tf_source",
        trueforgeSessionId: "tf_sess_1",
        interruptId,
        toolCallId: "tc_1",
        threadId: "thread_1",
        resultRedacted: { selectedRowId: "row_1" },
      });

      const marked = await markComponentInterruptContinued(sql, {
        interruptId,
        agentTurnId: claim.agentTurnId,
        now: TEST_NOW,
      });
      expect(marked).toEqual({ ok: true });

      const [continued] = await sql<{ state: string; continued_at: string | null }[]>`
        SELECT state, continued_at
        FROM ui_component_interrupts
        WHERE id = ${interruptId}
      `;
      expect(continued).toMatchObject({
        state: "continued",
        continued_at: TEST_NOW,
      });
    });
  }, 60_000);
});
