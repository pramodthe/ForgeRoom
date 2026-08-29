import { describe, expect, it } from "vitest";
import { skillDraftCreateCommandSchema, skillDraftSchema } from "@forgeroom/contracts";
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

async function seedCompletedRun(sql: Parameters<Parameters<typeof withMigratedDatabase>[0]>[0]) {
  await seedRuntime(sql);
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
      trueforgeEventId: "tf_evt_skill_api_1",
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
    VALUES ('pg_skill_api_1', 'turn_1', 'tf_turn_api_1', 1, 'collecting', 1)
  `;
  await sql`
    INSERT INTO required_actions (
      id, pause_group_id, provider_action_id, action_type, state, payload_redacted_json, payload_hash, created_at
    )
    VALUES ('ra_skill_api_1', 'pg_skill_api_1', 'prov_skill_api_1', 'approval', 'pending', '{}'::jsonb, ${HASH}, ${NOW})
  `;
  await sql`
    INSERT INTO action_proposals (
      id, required_action_id, run_id, run_step_id, agent_turn_id, tool_call_id, session_generation_id,
      approval_policy_hash, connector_binding_id, tool_name, observed_descriptor_hash, acting_identity_json,
      normalized_arguments_redacted_json, arguments_hash, target_redacted_json, target_hash,
      risk_class, expected_effect, state, expires_at
    )
    VALUES (
      'ap_api_1', 'ra_skill_api_1', 'run_1', 'step_1', 'turn_1', 'tc_write_api', 'gen_1',
      ${HASH}, 'cb_1', 'GITHUB_ADD_LABELS_TO_AN_ISSUE', ${HASH}, '{}'::jsonb,
      '{}'::jsonb, ${HASH}, '{}'::jsonb, ${HASH},
      'medium', 'write', 'allowed', ${NOW}
    )
  `;
}

describe("skill draft API", () => {
  it("creates and reloads a skill draft from a completed run", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedCompletedRun(sql);
      const store = createPostgresWorkspaceStore(sql);
      const workspace = createWorkspaceService({ store, sql });
      const command = skillDraftCreateCommandSchema.parse({
        schemaVersion: 1,
        source_step_ids: ["step_1"],
        idempotency_key: "idem_skill_draft_1",
      });

      const created = await workspace.createSkillDraft(SESSION, "run_1", command);
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const draft = skillDraftSchema.parse(created.value);
      expect(draft.source_run_id).toBe("run_1");

      const reloaded = await workspace.getSkillDraft(SESSION, draft.id);
      expect(reloaded.ok).toBe(true);
      if (!reloaded.ok) return;
      expect(reloaded.value.draft_hash).toBe(draft.draft_hash);
    });
  }, 60_000);

  it("rejects draft creation for an active run", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const store = createPostgresWorkspaceStore(sql);
      const workspace = createWorkspaceService({ store, sql });
      const result = await workspace.createSkillDraft(SESSION, "run_1", {
        schemaVersion: 1,
        source_step_ids: ["step_1"],
        idempotency_key: "idem_skill_draft_2",
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe("validation_failed");
    });
  }, 60_000);
});
