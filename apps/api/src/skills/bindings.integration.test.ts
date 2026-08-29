import { describe, expect, it } from "vitest";
import {
  skillBindingCreateCommandSchema,
  skillBindingSchema,
  skillDraftPublishCommandSchema,
  skillDraftSchema,
  skillVersionSchema,
} from "@forgeroom/contracts";
import type { SessionResponse } from "@forgeroom/contracts";
import { createPostgresWorkspaceStore } from "../workspace/postgres-store";
import { createWorkspaceService } from "../workspace/service";
import { ingestNormalizedTrueForgeEvent } from "@forgeroom/db";
import { seedRuntime, withMigratedDatabase } from "@forgeroom/db/test-harness";

const SESSION: SessionResponse = {
  request_id: "req_test",
  user: { id: "user_1", email: "owner@example.test", display_name: "Owner", role: "owner" },
  workspace_id: "ws_1",
  csrf_token: "csrf_test",
  expires_at: "2026-08-29T00:00:00.000Z",
};

const NOW = "2026-08-29T00:00:00.000Z";
const HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

async function grantCoworkerTools(sql: Parameters<Parameters<typeof withMigratedDatabase>[0]>[0]) {
  await sql`
    UPDATE connector_bindings
    SET allowed_tools_json = ${JSON.stringify([
      "GITHUB_GET_AN_ISSUE",
      "GITHUB_ADD_LABELS_TO_AN_ISSUE",
    ])}::jsonb
    WHERE id = 'cb_1'
  `;
  await sql`
    INSERT INTO ui_component_grants (
      id, component_version_id, workspace_id, channel_id, agent_profile_id, granted_by, granted_at
    )
    VALUES ('cg_skill_bind', 'compv_1', 'ws_1', NULL, 'cw_1', 'user_1', ${NOW})
    ON CONFLICT (id) DO NOTHING
  `;
  const config = {
    standing_instructions: "",
    model_preset: "openai/gpt-5-4-mini",
    budget: { max_turn_tokens: 12000, max_tool_calls: 20 },
    channel_ids: ["ch_1"],
    task_record_grants: [],
    tool_grants: ["GITHUB_GET_AN_ISSUE", "GITHUB_ADD_LABELS_TO_AN_ISSUE"],
    skill_version_ids: [],
    component_version_ids: ["compv_1"],
    connectors: [
      {
        name: "github",
        enabled_tools: ["GITHUB_GET_AN_ISSUE", "GITHUB_ADD_LABELS_TO_AN_ISSUE"],
        approval_required_tools: ["GITHUB_ADD_LABELS_TO_AN_ISSUE"],
      },
    ],
  };
  await sql`
    UPDATE agent_profiles
    SET editable_config_json = ${sql.json(config)}
    WHERE id = 'cw_1'
  `;
}

async function seedPublishedSkill(sql: Parameters<Parameters<typeof withMigratedDatabase>[0]>[0]) {
  await seedRuntime(sql);
  await grantCoworkerTools(sql);
  await sql`
    UPDATE runs
    SET lifecycle = 'completed', completed_at = ${NOW}
    WHERE id = 'run_1'
  `;
  await sql`
    UPDATE run_steps
    SET state = 'completed', completed_at = ${NOW}
    WHERE id = 'step_1'
  `;
  await ingestNormalizedTrueForgeEvent(sql, {
    agentTurnId: "turn_1",
    expectedTurnStates: ["streaming", "creating", "required_actions", "completed"],
    now: NOW,
    event: {
      trueforgeEventId: "tf_evt_bind_api_1",
      normalizedType: "tool.succeeded",
      threadId: "thread_1",
      sequenceNumber: 1,
      payloadRedacted: {
        type: "tool.succeeded",
        tool_name: "GITHUB_GET_AN_ISSUE",
        target: "pramodthe/ForgeRoom#35",
      },
    },
  });
  await sql`
    INSERT INTO pause_groups (
      id, agent_turn_id, trueforge_turn_id, generation, state, required_action_count
    )
    VALUES ('pg_bind_api_1', 'turn_1', 'tf_turn_bind_api_1', 1, 'collecting', 1)
  `;
  await sql`
    INSERT INTO required_actions (
      id, pause_group_id, provider_action_id, action_type, state, payload_redacted_json, payload_hash, created_at
    )
    VALUES ('ra_bind_api_1', 'pg_bind_api_1', 'prov_bind_api_1', 'approval', 'pending', '{}'::jsonb, ${HASH}, ${NOW})
  `;
  await sql`
    INSERT INTO action_proposals (
      id, required_action_id, run_id, run_step_id, agent_turn_id, tool_call_id, session_generation_id,
      approval_policy_hash, connector_binding_id, tool_name, observed_descriptor_hash, acting_identity_json,
      normalized_arguments_redacted_json, arguments_hash, target_redacted_json, target_hash,
      risk_class, expected_effect, state, expires_at
    )
    VALUES (
      'ap_bind_api_1', 'ra_bind_api_1', 'run_1', 'step_1', 'turn_1', 'tc_bind_api', 'gen_1',
      ${HASH}, 'cb_1', 'GITHUB_ADD_LABELS_TO_AN_ISSUE', ${HASH}, '{}'::jsonb,
      '{}'::jsonb, ${HASH}, '{}'::jsonb, ${HASH},
      'medium', 'write', 'allowed', ${NOW}
    )
  `;
}

describe("skill binding API", () => {
  it("attaches a published skill when coworker authority already covers requirements", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedPublishedSkill(sql);
      const store = createPostgresWorkspaceStore(sql);
      const workspace = createWorkspaceService({ store, sql });
      const created = await workspace.createSkillDraft(SESSION, "run_1", {
        schemaVersion: 1,
        source_step_ids: ["step_1"],
        idempotency_key: "idem_skill_bind_create",
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const draft = skillDraftSchema.parse(created.value);
      const published = await workspace.publishSkillDraft(SESSION, draft.id, {
        schemaVersion: 1,
        expected_revision: draft.revision,
        expected_draft_hash: draft.draft_hash,
        expected_source_content_hash: draft.source_content_hash,
        idempotency_key: "idem_skill_bind_publish",
      });
      expect(published.ok).toBe(true);
      if (!published.ok) return;
      const version = skillVersionSchema.parse(published.value);
      const coworker = await store.getCoworker("cw_1");
      expect(coworker).not.toBeNull();
      if (!coworker) return;
      const command = skillBindingCreateCommandSchema.parse({
        schemaVersion: 1,
        skill_version_id: version.id,
        expected_manifest_hash: version.manifest_hash,
        expected_coworker_config_revision: coworker.configRevision,
        idempotency_key: "idem_skill_bind_attach",
      });
      const attached = await workspace.createSkillBinding(SESSION, "cw_1", command);
      expect(attached.ok).toBe(true);
      if (!attached.ok) return;
      const binding = skillBindingSchema.parse(attached.value);
      expect(binding.state).toBe("active");
      expect(binding.skill_version_id).toBe(version.id);
      const updated = await store.getCoworker("cw_1");
      expect(updated?.editableConfigJson.skill_version_ids).toContain(version.id);
    });
  }, 60_000);

  it("rejects attach when required tools are outside coworker authority", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedPublishedSkill(sql);
      const restrictedConfig = {
        standing_instructions: "",
        model_preset: "openai/gpt-5-4-mini",
        budget: { max_turn_tokens: 12000, max_tool_calls: 20 },
        channel_ids: ["ch_1"],
        task_record_grants: [],
        tool_grants: ["GITHUB_GET_AN_ISSUE"],
        skill_version_ids: [],
        component_version_ids: ["compv_1"],
        connectors: [
          {
            name: "github",
            enabled_tools: ["GITHUB_GET_AN_ISSUE"],
            approval_required_tools: [],
          },
        ],
      };
      await sql`
        UPDATE agent_profiles
        SET editable_config_json = ${sql.json(restrictedConfig)}
        WHERE id = 'cw_1'
      `;
      const store = createPostgresWorkspaceStore(sql);
      const workspace = createWorkspaceService({ store, sql });
      const created = await workspace.createSkillDraft(SESSION, "run_1", {
        schemaVersion: 1,
        source_step_ids: ["step_1"],
        idempotency_key: "idem_skill_bind_reject_create",
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const draft = skillDraftSchema.parse(created.value);
      const published = await workspace.publishSkillDraft(
        SESSION,
        draft.id,
        skillDraftPublishCommandSchema.parse({
          schemaVersion: 1,
          expected_revision: draft.revision,
          expected_draft_hash: draft.draft_hash,
          expected_source_content_hash: draft.source_content_hash,
          idempotency_key: "idem_skill_bind_reject_publish",
        }),
      );
      expect(published.ok).toBe(true);
      if (!published.ok) return;
      const version = skillVersionSchema.parse(published.value);
      const coworker = await store.getCoworker("cw_1");
      expect(coworker).not.toBeNull();
      if (!coworker) return;
      const result = await workspace.createSkillBinding(SESSION, "cw_1", {
        schemaVersion: 1,
        skill_version_id: version.id,
        expected_manifest_hash: version.manifest_hash,
        expected_coworker_config_revision: coworker.configRevision,
        idempotency_key: "idem_skill_bind_reject_attach",
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("validation_failed");
    });
  }, 60_000);
});
