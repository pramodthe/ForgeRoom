import { describe, expect, it } from "vitest";
import type postgres from "postgres";
import { skillBindingSchema, skillDraftSchema } from "@forgeroom/contracts";
import {
  attachSkillBindingRecord,
  findActiveSkillBinding,
  loadPinnedSkillStableNames,
} from "./skill-bindings";
import {
  createSkillDraftRecord,
  loadSkillRunEvidence,
  publishSkillDraftRecord,
  slugifySkillStableName,
} from "./skill-drafts";
import { ingestNormalizedTrueForgeEvent } from "./turn-lifecycle";
import { seedRuntime, withMigratedDatabase } from "./test-harness";

const NOW = "2026-08-29T00:00:00.000Z";
const HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

async function grantCoworkerTools(sql: postgres.Sql) {
  await sql`
    UPDATE connector_bindings
    SET allowed_tools_json = ${JSON.stringify([
      "GITHUB_GET_AN_ISSUE",
      "GITHUB_ADD_LABELS_TO_AN_ISSUE",
    ])}::jsonb
    WHERE id = 'cb_1'
  `;
  const config = {
    standing_instructions: "",
    model_preset: "openai/gpt-5-4-mini",
    budget: { max_turn_tokens: 12000, max_tool_calls: 20 },
    channel_ids: ["ch_1"],
    task_record_grants: [],
    tool_grants: ["GITHUB_GET_AN_ISSUE", "GITHUB_ADD_LABELS_TO_AN_ISSUE"],
    skill_version_ids: [],
    component_version_ids: [],
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
    SET editable_config_json = ${JSON.stringify(config)}::jsonb
    WHERE id = 'cw_1'
  `;
}

async function seedPublishedSkill(sql: postgres.Sql) {
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
      trueforgeEventId: "tf_evt_bind_1",
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
    VALUES ('pg_bind_1', 'turn_1', 'tf_turn_bind_1', 1, 'collecting', 1)
  `;
  await sql`
    INSERT INTO required_actions (
      id, pause_group_id, provider_action_id, action_type, state, payload_redacted_json, payload_hash, created_at
    )
    VALUES ('ra_bind_1', 'pg_bind_1', 'prov_bind_1', 'approval', 'pending', '{}'::jsonb, ${HASH}, ${NOW})
  `;
  await sql`
    INSERT INTO action_proposals (
      id, required_action_id, run_id, run_step_id, agent_turn_id, tool_call_id, session_generation_id,
      approval_policy_hash, connector_binding_id, tool_name, observed_descriptor_hash, acting_identity_json,
      normalized_arguments_redacted_json, arguments_hash, target_redacted_json, target_hash,
      risk_class, expected_effect, state, expires_at
    )
    VALUES (
      'ap_bind_1', 'ra_bind_1', 'run_1', 'step_1', 'turn_1', 'tc_bind', 'gen_1',
      ${HASH}, 'cb_1', 'GITHUB_ADD_LABELS_TO_AN_ISSUE', ${HASH}, '{}'::jsonb,
      '{}'::jsonb, ${HASH}, '{}'::jsonb, ${HASH},
      'medium', 'write', 'allowed', ${NOW}
    )
  `;
  const loaded = await loadSkillRunEvidence(sql, {
    runId: "run_1",
    workspaceId: "ws_1",
    sourceStepIds: ["step_1"],
  });
  if (!loaded.ok) {
    throw new Error("failed to load evidence");
  }
  const draft = await createSkillDraftRecord(sql, {
    workspaceId: "ws_1",
    channelId: "ch_1",
    createdBy: "user_1",
    draftId: "skd_bind_1",
    skillId: "skill_bind_1",
    stableName: slugifySkillStableName(loaded.evidence.goal, loaded.evidence.runId),
    displayName: loaded.evidence.goal,
    evidence: loaded.evidence,
    now: NOW,
  });
  const parsed = skillDraftSchema.parse(draft);
  const published = await publishSkillDraftRecord(sql, {
    draftId: "skd_bind_1",
    workspaceId: "ws_1",
    channelId: "ch_1",
    publishedBy: "user_1",
    expectedRevision: parsed.revision,
    expectedDraftHash: parsed.draft_hash,
    expectedSourceContentHash: parsed.source_content_hash,
    now: NOW,
  });
  if (!published.ok) {
    throw new Error("failed to publish skill");
  }
  return published.version;
}

describe("skill bindings persistence", () => {
  it("attaches a published skill version to a coworker", async () => {
    await withMigratedDatabase(async (sql) => {
      const version = await seedPublishedSkill(sql);
      const configRows = await sql<{ editable_config_json: unknown; config_revision: number }[]>`
        SELECT editable_config_json, config_revision
        FROM agent_profiles
        WHERE id = 'cw_1'
      `;
      const config = configRows[0]?.editable_config_json as {
        skill_version_ids: string[];
      };
      const attached = await attachSkillBindingRecord(sql, {
        bindingId: "skb_1",
        coworkerId: "cw_1",
        workspaceId: "ws_1",
        skillVersionId: version.id,
        expectedManifestHash: version.manifest_hash,
        expectedConfigRevision: configRows[0]?.config_revision ?? 1,
        attachedBy: "user_1",
        agentVersionId: "av_bind_1",
        nextAgentVersion: 2,
        nextConfigRevision: (configRows[0]?.config_revision ?? 1) + 1,
        nextEditableConfig: {
          ...config,
          skill_version_ids: [version.id],
        },
        specHash: HASH,
        channelId: "ch_1",
        sourceRunId: version.source_run_id,
        skillId: version.skill_id,
        manifestHash: version.manifest_hash,
        now: NOW,
      });
      expect(attached.ok).toBe(true);
      if (!attached.ok) return;
      const binding = skillBindingSchema.parse(attached.binding);
      expect(binding.state).toBe("active");
      expect(binding.skill_version_id).toBe(version.id);
      const reloaded = await findActiveSkillBinding(sql, "cw_1", version.id);
      expect(reloaded?.id).toBe("skb_1");
      const names = await loadPinnedSkillStableNames(sql, [version.id]);
      expect(names.length).toBe(1);
    });
  }, 60_000);
});
