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
});
