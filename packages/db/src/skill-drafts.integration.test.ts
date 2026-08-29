import { describe, expect, it } from "vitest";
import { skillDraftSchema } from "@forgeroom/contracts";
import type postgres from "postgres";
import {
  createSkillDraftRecord,
  getSkillDraftById,
  loadSkillRunEvidence,
  slugifySkillStableName,
} from "./skill-drafts";
import { seedRuntime, withMigratedDatabase } from "./test-harness";

const NOW = "2026-08-29T00:00:00.000Z";
const HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

async function seedCompletedRun(sql: postgres.Sql) {
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
      id, agent_turn_id, trueforge_event_id, thread_id,
      normalized_payload_redacted_json, normalized_type, first_seen_at, updated_at
    ) VALUES (
      're_1', 'turn_1', 'tf_evt_1', 'thread_1',
      ${JSON.stringify({
        type: "tool.succeeded",
        tool_name: "GITHUB_GET_AN_ISSUE",
        target: "pramodthe/ForgeRoom#35",
        result_summary: "Issue loaded",
      })}::jsonb,
      'tool.succeeded', ${NOW}, ${NOW}
    )
  `;
  await sql`
    INSERT INTO pause_groups (
      id, agent_turn_id, trueforge_turn_id, generation, state, required_action_count
    )
    VALUES ('pg_skill_1', 'turn_1', 'tf_turn_1', 1, 'collecting', 1)
  `;
  await sql`
    INSERT INTO required_actions (
      id, pause_group_id, provider_action_id, action_type, state, payload_redacted_json, payload_hash, created_at
    )
    VALUES ('ra_skill_1', 'pg_skill_1', 'prov_skill_1', 'approval', 'pending', '{}'::jsonb, ${HASH}, ${NOW})
  `;
  await sql`
    INSERT INTO action_proposals (
      id, required_action_id, run_id, run_step_id, agent_turn_id, tool_call_id, session_generation_id,
      approval_policy_hash, connector_binding_id, tool_name, observed_descriptor_hash, acting_identity_json,
      normalized_arguments_redacted_json, arguments_hash, target_redacted_json, target_hash,
      risk_class, expected_effect, state, expires_at
    )
    VALUES (
      'ap_1', 'ra_skill_1', 'run_1', 'step_1', 'turn_1', 'tc_write', 'gen_1',
      ${HASH}, 'cb_1', 'GITHUB_ADD_LABELS_TO_AN_ISSUE', ${HASH}, '{}'::jsonb,
      '{}'::jsonb, ${HASH}, '{}'::jsonb, ${HASH},
      'medium', 'write', 'allowed', ${NOW}
    )
  `;
}

describe("skill drafts persistence", () => {
  it("creates a draft from a completed run and reloads it by id", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedCompletedRun(sql);
      const loaded = await loadSkillRunEvidence(sql, {
        runId: "run_1",
        workspaceId: "ws_1",
        sourceStepIds: ["step_1"],
      });
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;

      const draft = await createSkillDraftRecord(sql, {
        workspaceId: "ws_1",
        channelId: "ch_1",
        createdBy: "user_1",
        draftId: "skd_1",
        skillId: "skill_1",
        stableName: slugifySkillStableName(loaded.evidence.goal, loaded.evidence.runId),
        displayName: loaded.evidence.goal,
        evidence: loaded.evidence,
        now: NOW,
      });
      const parsed = skillDraftSchema.parse(draft);
      expect(parsed.source_run_id).toBe("run_1");
      expect(parsed.source_step_ids).toEqual(["step_1"]);
      expect(parsed.required_tools).toContain("GITHUB_GET_AN_ISSUE");

      const reloaded = await getSkillDraftById(sql, "skd_1");
      expect(reloaded?.draft.id).toBe("skd_1");
      expect(reloaded?.workspaceId).toBe("ws_1");
    });
  }, 60_000);

  it("rejects draft creation for active runs", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const loaded = await loadSkillRunEvidence(sql, {
        runId: "run_1",
        workspaceId: "ws_1",
        sourceStepIds: ["step_1"],
      });
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      await expect(
        createSkillDraftRecord(sql, {
          workspaceId: "ws_1",
          channelId: "ch_1",
          createdBy: "user_1",
          draftId: "skd_2",
          skillId: "skill_2",
          stableName: "inspect_run_1",
          displayName: "Inspect",
          evidence: loaded.evidence,
          now: NOW,
        }),
      ).rejects.toThrow(/run_not_completed/);
    });
  }, 60_000);
});
