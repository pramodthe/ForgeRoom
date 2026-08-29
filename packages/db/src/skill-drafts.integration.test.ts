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
      id, agent_turn_id, normalized_type, normalized_payload_redacted_json, dedupe_key,
      first_seen_at, last_seen_at
    ) VALUES (
      're_1', 'turn_1', 'tool.succeeded',
      ${JSON.stringify({
        type: "tool.succeeded",
        tool_name: "GITHUB_GET_AN_ISSUE",
        target: "pramodthe/ForgeRoom#35",
        result_summary: "Issue loaded",
      })}::jsonb,
      'dedupe_tool_1', ${NOW}, ${NOW}
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
      'ap_1', 'ws_1', 'ch_1', 'run_1', 'step_1', 'turn_1', 'cw_1',
      'GITHUB_ADD_LABELS_TO_AN_ISSUE', 'allowed', '{}'::jsonb, ${HASH}, '{}'::jsonb,
      ${HASH}, ${HASH}, ${HASH}, 'cb_1', 'acct_1', '{}'::jsonb, 'write', 'medium',
      ${HASH}, 1, 'gen_1', ${NOW}, ${NOW}
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
