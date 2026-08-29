import { describe, expect, it } from "vitest";
import { skillDraftCreateCommandSchema, skillDraftSchema } from "@forgeroom/contracts";
import type { SessionResponse } from "@forgeroom/contracts";
import { createPostgresWorkspaceStore } from "../workspace/postgres-store";
import { createWorkspaceService } from "../workspace/service";
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
  await sql`
    INSERT INTO run_events (
      id, agent_turn_id, normalized_type, normalized_payload_redacted_json, dedupe_key,
      first_seen_at, last_seen_at
    ) VALUES (
      're_api_1', 'turn_1', 'tool.succeeded',
      ${JSON.stringify({
        type: "tool.succeeded",
        tool_name: "GITHUB_GET_AN_ISSUE",
        target: "pramodthe/ForgeRoom#35",
      })}::jsonb,
      'dedupe_tool_api_1', ${NOW}, ${NOW}
    )
  `;
  await sql`
    INSERT INTO action_proposals (
      id, workspace_id, channel_id, run_id, run_step_id, agent_turn_id, coworker_id,
      tool_name, state, redacted_arguments_json, arguments_hash, redacted_target_json,
      target_hash, observed_descriptor_hash, approval_policy_hash, connector_binding_id,
      account_id, acting_identity_json, expected_effect, risk_class, payload_hash,
      session_generation, session_generation_id, expires_at, created_at
    ) VALUES (
      'ap_api_1', 'ws_1', 'ch_1', 'run_1', 'step_1', 'turn_1', 'cw_1',
      'GITHUB_ADD_LABELS_TO_AN_ISSUE', 'allowed', '{}'::jsonb, ${HASH}, '{}'::jsonb,
      ${HASH}, ${HASH}, ${HASH}, 'cb_1', 'acct_1', '{}'::jsonb, 'write', 'medium',
      ${HASH}, 1, 'gen_1', ${NOW}, ${NOW}
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
