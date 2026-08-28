import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalizeJson } from "@forgeroom/domain";
import { actionGrantSchema } from "@forgeroom/contracts";
import { commitUiInteraction, issueUiInteractionToken } from "./ui-interactions";
import { HASH, NOW, seedRuntime, withMigratedDatabase } from "./test-harness";

const TEST_NOW = "2020-01-01T00:00:00.000Z";
const INTERACTION_TOKEN_SECRET = "test-interaction-token-secret";

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalizeJson(value), "utf8").digest("hex")}`;
}

async function prepareReadySurface(sql: Parameters<typeof seedRuntime>[0]): Promise<void> {
  const inputSchema = { type: "object", additionalProperties: false, enum: [{}] };
  const actionBody = actionGrantSchema.parse({
    schemaVersion: 1,
    id: "ag_test",
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
    action_ref: "select_row",
    handler_key: "select_row",
    input_schema: inputSchema,
    input_schema_hash: sha256(inputSchema),
    allowed_render_node_ids: ["node_1"],
    requires_recent_auth: false,
    requires_trusted_confirmation: false,
    max_uses: 3,
    use_count: 0,
    mode: "local_state",
  });

  await sql`
    INSERT INTO ui_instance_revisions (
      id, ui_instance_id, revision_kind, revision, component_version_id, renderer_profile_hash,
      validator_policy_version, render_node_set_json, render_node_set_hash, render_payload_json,
      render_payload_hash, render_manifest_json, manifest_hash, validated_props_json, validated_props_hash,
      accessible_summary, content_hash, validation_state, created_at, promoted_at
    ) VALUES (
      'uir_render_0', 'ui_1', 'render', 0, 'compv_1', ${HASH},
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
      allowed_render_node_ids_json, grant_body_redacted_json, grant_scope_hash,
      max_uses, use_count, issued_by, expires_at, created_at
    ) VALUES (
      'ag_test', 'ui_1', 'action', 1, 0, ${HASH}, 'select_row', 'select_row', 'local_state',
      ${JSON.stringify(inputSchema)}::jsonb, ${sha256(inputSchema)}, '["node_1"]'::jsonb,
      ${JSON.stringify(actionBody)}::jsonb, ${HASH}, 3, 0, 'application_policy', ${NOW}, ${NOW}
    )
  `;
}

describe("UI interaction gateway", () => {
  it("issues a bound token, commits local state once, and replays the terminal result", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await prepareReadySurface(sql);

      const request = {
        schemaVersion: 1 as const,
        surfaceId: "ui_1",
        renderNodeId: "node_1",
        renderRevision: 0,
        expectedStateRevision: null,
        actionGrantId: "ag_test",
        actionRef: "select_row",
        input: {},
        clientKind: "registry" as const,
        idempotencyKey: "interaction-test-1",
      };
      const issued = await issueUiInteractionToken(sql, {
        instanceId: "ui_1",
        workspaceId: "ws_1",
        actorUserId: "user_1",
        request,
        interactionTokenSecret: INTERACTION_TOKEN_SECRET,
        now: TEST_NOW,
      });
      if (!issued.ok) throw new Error(`${issued.error.code}: ${issued.error.message}`);
      if (!issued.ok) return;
      expect(issued.value.interactionToken).toHaveLength(43);
      const issuanceRetry = await issueUiInteractionToken(sql, {
        instanceId: "ui_1",
        workspaceId: "ws_1",
        actorUserId: "user_1",
        request,
        interactionTokenSecret: INTERACTION_TOKEN_SECRET,
        now: TEST_NOW,
      });
      expect(issuanceRetry).toEqual(issued);
      const concurrentIssuance = await Promise.all([
        issueUiInteractionToken(sql, {
          instanceId: "ui_1",
          workspaceId: "ws_1",
          actorUserId: "user_1",
          request,
          interactionTokenSecret: INTERACTION_TOKEN_SECRET,
          now: TEST_NOW,
        }),
        issueUiInteractionToken(sql, {
          instanceId: "ui_1",
          workspaceId: "ws_1",
          actorUserId: "user_1",
          request,
          interactionTokenSecret: INTERACTION_TOKEN_SECRET,
          now: TEST_NOW,
        }),
      ]);
      expect(concurrentIssuance).toEqual([issued, issued]);

      const committed = await commitUiInteraction(sql, {
        instanceId: "ui_1",
        workspaceId: "ws_1",
        actorUserId: "user_1",
        interactionId: issued.value.interactionId,
        interactionToken: issued.value.interactionToken,
        now: TEST_NOW,
      });
      expect(committed).toMatchObject({
        ok: true,
        value: { state: "succeeded", stateRevision: 0, resultRef: expect.any(String) },
      });

      const replayed = await commitUiInteraction(sql, {
        instanceId: "ui_1",
        workspaceId: "ws_1",
        actorUserId: "user_1",
        interactionId: issued.value.interactionId,
        interactionToken: issued.value.interactionToken,
        now: TEST_NOW,
      });
      expect(replayed).toEqual(committed);
      const [stored] = await sql<{ state: string; interaction_token_hash: string | null }[]>`
        SELECT state, interaction_token_hash FROM ui_interactions WHERE id = ${issued.value.interactionId}
      `;
      expect(stored).toMatchObject({ state: "succeeded" });
      expect(stored?.interaction_token_hash).not.toBe(issued.value.interactionToken);
    });
  }, 60_000);

  it("rejects a wrong token and marks a stale state revision without dispatch", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await prepareReadySurface(sql);
      const invalidInput = await issueUiInteractionToken(sql, {
        instanceId: "ui_1",
        workspaceId: "ws_1",
        actorUserId: "user_1",
        request: {
          schemaVersion: 1,
          surfaceId: "ui_1",
          renderNodeId: "node_1",
          renderRevision: 0,
          expectedStateRevision: null,
          actionGrantId: "ag_test",
          actionRef: "select_row",
          input: { unexpected: true },
          clientKind: "registry",
          idempotencyKey: "interaction-test-invalid",
        },
        interactionTokenSecret: INTERACTION_TOKEN_SECRET,
        now: TEST_NOW,
      });
      expect(invalidInput).toEqual({
        ok: false,
        error: { code: "ui_interaction_not_allowed", message: "ActionGrant binding is invalid." },
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
          actionGrantId: "ag_test",
          actionRef: "select_row",
          input: {},
          clientKind: "registry",
          idempotencyKey: "interaction-test-stale",
        },
        interactionTokenSecret: INTERACTION_TOKEN_SECRET,
        now: TEST_NOW,
      });
      if (!issued.ok) throw new Error(`${issued.error.code}: ${issued.error.message}`);
      if (!issued.ok) return;

      const badToken = await commitUiInteraction(sql, {
        instanceId: "ui_1",
        workspaceId: "ws_1",
        actorUserId: "user_1",
        interactionId: issued.value.interactionId,
        interactionToken: `${issued.value.interactionToken}x`,
        now: TEST_NOW,
      });
      expect(badToken).toEqual({
        ok: false,
        error: { code: "forbidden", message: "Interaction token is invalid." },
      });

      await sql`UPDATE ui_instances SET current_state_revision = 1 WHERE id = 'ui_1'`;
      const stale = await commitUiInteraction(sql, {
        instanceId: "ui_1",
        workspaceId: "ws_1",
        actorUserId: "user_1",
        interactionId: issued.value.interactionId,
        interactionToken: issued.value.interactionToken,
        now: TEST_NOW,
      });
      expect(stale).toMatchObject({ ok: true, value: { state: "stale" } });
      const retry = await commitUiInteraction(sql, {
        instanceId: "ui_1",
        workspaceId: "ws_1",
        actorUserId: "user_1",
        interactionId: issued.value.interactionId,
        interactionToken: issued.value.interactionToken,
        now: TEST_NOW,
      });
      expect(retry).toEqual(stale);
    });
  }, 60_000);

  it("serializes concurrent commits for the same bounded shared state", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await prepareReadySurface(sql);
      const request = {
        schemaVersion: 1 as const,
        surfaceId: "ui_1",
        renderNodeId: "node_1",
        renderRevision: 0,
        expectedStateRevision: null,
        actionGrantId: "ag_test",
        actionRef: "select_row",
        input: {},
        clientKind: "registry" as const,
        idempotencyKey: "interaction-test-concurrent-a",
      };
      const issued = await Promise.all([
        issueUiInteractionToken(sql, {
          instanceId: "ui_1",
          workspaceId: "ws_1",
          actorUserId: "user_1",
          request: { ...request, idempotencyKey: "interaction-test-concurrent-b" },
          interactionTokenSecret: INTERACTION_TOKEN_SECRET,
          now: TEST_NOW,
        }),
        issueUiInteractionToken(sql, {
          instanceId: "ui_1",
          workspaceId: "ws_1",
          actorUserId: "user_1",
          request,
          interactionTokenSecret: INTERACTION_TOKEN_SECRET,
          now: TEST_NOW,
        }),
      ]);
      expect(issued.every((result) => result.ok)).toBe(true);
      const first = issued[0];
      const second = issued[1];
      if (!first.ok || !second.ok) return;
      const committed = await Promise.all(
        [first, second].map((result) =>
          commitUiInteraction(sql, {
            instanceId: "ui_1",
            workspaceId: "ws_1",
            actorUserId: "user_1",
            interactionId: result.value.interactionId,
            interactionToken: result.value.interactionToken,
            now: TEST_NOW,
          }),
        ),
      );
      expect(
        committed.map((result) => (result.ok ? result.value.state : result.error.code)).sort(),
      ).toEqual(["stale", "succeeded"]);
      const [instance] = await sql<{ current_state_revision: number | null }[]>`
        SELECT current_state_revision FROM ui_instances WHERE id = 'ui_1'
      `;
      const [grant] = await sql<{ use_count: number }[]>`
        SELECT use_count FROM ui_surface_grants WHERE id = 'ag_test'
      `;
      expect(instance?.current_state_revision).toBe(0);
      expect(grant?.use_count).toBe(1);
    });
  }, 60_000);

  it("resolves a server_read interaction from the retained DataGrant snapshot", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const snapshot = {
        rows: [
          { id: "row_1", status: "open" },
          { id: "row_2", status: "ready" },
        ],
      };
      const inputSchema = { type: "object", additionalProperties: false, properties: {} };
      const dataGrantBody = {
        schemaVersion: 1,
        id: "dg_read",
        workspace_id: "ws_1",
        channel_id: "ch_1",
        surface_id: "ui_1",
        policy_revision: 1,
        issued_by: "application_policy",
        expires_at: NOW,
        revoked_at: null,
        grant_scope_hash: HASH,
        created_at: NOW,
        kind: "data",
        bound_render_revision: 0,
        bound_manifest_hash: HASH,
        data_ref: "report_rows",
        source: { kind: "query_snapshot", query_key: "reports", snapshot_id: "snap_1" },
        classification: "workspace_safe",
        classification_provenance: "fixture",
        snapshot_schema_hash: HASH,
        allowed_field_paths: [
          ["rows", "id"],
          ["rows", "status"],
        ],
        max_rows: 20,
        max_bytes: 4096,
        redaction_policy_key: "workspace-safe-v1",
        retained_snapshot_blob_key: "snapshots/snap_1",
        immutable_snapshot_hash: HASH,
      };
      const actionBody = actionGrantSchema.parse({
        schemaVersion: 1,
        id: "ag_read",
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
        action_ref: "refresh_rows",
        handler_key: "controlled_ui.refresh_rows.v1",
        input_schema: inputSchema,
        input_schema_hash: sha256(inputSchema),
        allowed_render_node_ids: ["node_1"],
        requires_recent_auth: false,
        requires_trusted_confirmation: false,
        max_uses: 2,
        use_count: 0,
        mode: "server_read",
        data_grant_id: "dg_read",
        data_ref: "report_rows",
        allowed_selection_paths: [],
      });

      await sql`
        INSERT INTO ui_instance_revisions (
          id, ui_instance_id, revision_kind, revision, component_version_id, renderer_profile_hash,
          validator_policy_version, render_node_set_json, render_node_set_hash, render_payload_json,
          render_payload_hash, render_manifest_json, manifest_hash, validated_props_json, validated_props_hash,
          data_snapshot_json, data_snapshot_hash, accessible_summary, content_hash, validation_state,
          created_at, promoted_at
        ) VALUES (
          'uirev_read_0', 'ui_1', 'render', 0, 'compv_1', ${HASH},
          'registry_v1', '[{"nodeId":"node_1"}]'::jsonb, ${HASH}, '{}'::jsonb,
          ${HASH}, '{}'::jsonb, ${HASH}, '{}'::jsonb, ${HASH},
          ${JSON.stringify(snapshot)}::jsonb, ${HASH}, 'A table', ${HASH}, 'valid', ${NOW}, ${NOW}
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
          data_ref, allowed_field_paths_json, max_rows, max_bytes, snapshot_schema_hash,
          immutable_snapshot_hash, grant_body_redacted_json, grant_scope_hash, issued_by, expires_at, created_at
        ) VALUES (
          'dg_read', 'ui_1', 'data', 1, 0, ${HASH}, 'report_rows',
          ${JSON.stringify(dataGrantBody.allowed_field_paths)}::jsonb, 20, 4096, ${HASH}, ${HASH},
          ${JSON.stringify(dataGrantBody)}::jsonb, ${HASH}, 'application_policy', ${NOW}, ${NOW}
        )
      `;
      await sql`
        INSERT INTO ui_surface_grants (
          id, ui_instance_id, grant_kind, policy_revision, bound_render_revision, bound_manifest_hash,
          action_ref, handler_key, action_mode, input_schema_json, input_schema_hash,
          allowed_render_node_ids_json, linked_data_grant_id, grant_body_redacted_json, grant_scope_hash,
          max_uses, use_count, issued_by, expires_at, created_at
        ) VALUES (
          'ag_read', 'ui_1', 'action', 1, 0, ${HASH}, 'refresh_rows',
          'controlled_ui.refresh_rows.v1', 'server_read', ${JSON.stringify(inputSchema)}::jsonb,
          ${sha256(inputSchema)}, '["node_1"]'::jsonb, 'dg_read', ${JSON.stringify(actionBody)}::jsonb,
          ${HASH}, 2, 0, 'application_policy', ${NOW}, ${NOW}
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
          actionGrantId: "ag_read",
          actionRef: "refresh_rows",
          input: {},
          clientKind: "registry",
          idempotencyKey: "server-read-test",
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
      expect(committed).toMatchObject({
        ok: true,
        value: {
          state: "succeeded",
          result: {
            dataRef: "report_rows",
            data: {
              rows: [
                { id: "row_1", status: "open" },
                { id: "row_2", status: "ready" },
              ],
            },
          },
        },
      });
    });
  }, 60_000);

  it("CAS-resolves a component interrupt and enqueues a same-RunStep continuation", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const inputSchema = { type: "object", additionalProperties: false, properties: {} };
      const interruptId = "intr_test";
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
          'uirev_complete_0', 'ui_1', 'render', 0, 'compv_1', ${HASH},
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
          'ag_complete', 'ui_1', 'action', 1, 0, ${HASH}, 'submit',
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
          'tc_1', 'gen_1', 'ag_complete', ${sha256(inputSchema)}, 'waiting', ${NOW}
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
          actionGrantId: "ag_complete",
          actionRef: "submit",
          input: {},
          clientKind: "registry",
          idempotencyKey: "complete-interrupt-test",
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
      expect(committed).toMatchObject({
        ok: true,
        value: {
          state: "succeeded",
          result: {},
          resultRef: expect.any(String),
        },
      });

      const [interrupt] = await sql<
        { state: string; continuation_queue_item_id: string | null }[]
      >`SELECT state, continuation_queue_item_id FROM ui_component_interrupts WHERE id = ${interruptId}`;
      expect(interrupt).toMatchObject({
        state: "resolved",
        continuation_queue_item_id: expect.any(String),
      });

      const queueItems = await sql<{ input_type: string; run_step_id: string }[]>`
        SELECT input_type, run_step_id
        FROM turn_queue_items
        WHERE channel_agent_session_id = 'cas_1'
          AND input_type = 'component_interaction_response'
      `;
      expect(queueItems).toEqual([
        { input_type: "component_interaction_response", run_step_id: "step_1" },
      ]);
    });
  }, 60_000);
});
