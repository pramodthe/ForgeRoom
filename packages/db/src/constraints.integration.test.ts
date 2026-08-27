import { describe, expect, it } from "vitest";
import { createSql } from "./client";
import { P0_TABLES } from "./schema";
import {
  HASH,
  NOW,
  seedRuntime,
  withMigratedDatabase,
  withTemporaryDatabase,
} from "./test-harness";
import { appliedMigrations, rollbackLast, migrate } from "./migrate";

const ALT_HASH = `sha256:${"cd".repeat(32)}`;

const EXCLUDED_COLUMN =
  /iframe|csp_|bootstrap|sanitizer|delivery_body|delivery_headers|delivery_security|verifier_|request_agent_turn|open_existing_hitl|confirmation_challenge|confirmation_summary|confirmed_by|confirmed_at|prepared_auth_session|requires_trusted_confirmation|target_coworker|intent_template|historical_replay|generated_origin|context_classification|iframe_context|agui_source_ref|default_coordinator|parent_run_step|source_blob|source_kind/;

describe("P0 foundation migration", () => {
  it("creates required tables, rolls back, and migrates forward again", async () => {
    await withMigratedDatabase(async (sql) => {
      const tables = await sql<{ table_name: string }[]>`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      `;
      const names = tables.map((row) => row.table_name);
      for (const table of P0_TABLES) {
        expect(names, table).toContain(table);
      }

      const forbidden = await sql<{ table_name: string; column_name: string }[]>`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
      `;
      expect(forbidden.filter((row) => EXCLUDED_COLUMN.test(row.column_name))).toEqual([]);

      const registryRolled = await rollbackLast(sql);
      expect(registryRolled).toBe("0005_artifact_content_revision_scope.sql");
      const componentRegistryRolled = await rollbackLast(sql);
      expect(componentRegistryRolled).toBe("0004_component_registry_constraints.sql");
      const boundaryRolled = await rollbackLast(sql);
      expect(boundaryRolled).toBe("0003_runs_source_message_unique.sql");
      const workspaceBoundaryRolled = await rollbackLast(sql);
      expect(workspaceBoundaryRolled).toBe("0002_session_workspace_boundary.sql");
      const foundationRolled = await rollbackLast(sql);
      expect(foundationRolled).toBe("0001_p0_foundation.sql");
      const afterDown = await sql<{ table_name: string }[]>`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'channels'
      `;
      expect(afterDown).toHaveLength(0);
      await migrate(sql);
      const afterUp = await sql<{ table_name: string }[]>`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'channels'
      `;
      expect(afterUp).toHaveLength(1);
    });
  }, 60_000);

  it("serializes concurrent forward and rollback operations", async () => {
    await withTemporaryDatabase(async (url) => {
      const first = createSql(url);
      const second = createSql(url);
      try {
        const forwardResults = await Promise.all([migrate(first), migrate(second)]);
        expect(forwardResults.flat()).toEqual([
          "0001_p0_foundation.sql",
          "0002_session_workspace_boundary.sql",
          "0003_runs_source_message_unique.sql",
          "0004_component_registry_constraints.sql",
          "0005_artifact_content_revision_scope.sql",
        ]);
        expect(await appliedMigrations(first)).toEqual([
          "0001_p0_foundation.sql",
          "0002_session_workspace_boundary.sql",
          "0003_runs_source_message_unique.sql",
          "0004_component_registry_constraints.sql",
          "0005_artifact_content_revision_scope.sql",
        ]);

        const rollbackResults = await Promise.all([
          rollbackLast(first),
          rollbackLast(second),
          rollbackLast(first),
          rollbackLast(second),
          rollbackLast(first),
          rollbackLast(second),
        ]);
        expect(rollbackResults).toEqual(
          expect.arrayContaining([
            "0005_artifact_content_revision_scope.sql",
            "0004_component_registry_constraints.sql",
            "0003_runs_source_message_unique.sql",
            "0002_session_workspace_boundary.sql",
            "0001_p0_foundation.sql",
            null,
          ]),
        );
      } finally {
        await Promise.all([first.end({ timeout: 5 }), second.end({ timeout: 5 })]);
      }
    });
  }, 60_000);

  it("backfills workspace ownership for existing stable sessions", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      expect(await rollbackLast(sql)).toBe("0005_artifact_content_revision_scope.sql");
      expect(await rollbackLast(sql)).toBe("0004_component_registry_constraints.sql");
      expect(await rollbackLast(sql)).toBe("0003_runs_source_message_unique.sql");
      expect(await rollbackLast(sql)).toBe("0002_session_workspace_boundary.sql");
      expect(await migrate(sql)).toEqual([
        "0002_session_workspace_boundary.sql",
        "0003_runs_source_message_unique.sql",
        "0004_component_registry_constraints.sql",
        "0005_artifact_content_revision_scope.sql",
      ]);

      const [session] = await sql<{ workspace_id: string }[]>`
        SELECT workspace_id
        FROM channel_agent_sessions
        WHERE id = 'cas_1'
      `;
      expect(session?.workspace_id).toBe("ws_1");
    });
  }, 60_000);

  it("identifies cross-workspace legacy sessions before enforcing the boundary", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      expect(await rollbackLast(sql)).toBe("0005_artifact_content_revision_scope.sql");
      expect(await rollbackLast(sql)).toBe("0004_component_registry_constraints.sql");
      expect(await rollbackLast(sql)).toBe("0003_runs_source_message_unique.sql");
      expect(await rollbackLast(sql)).toBe("0002_session_workspace_boundary.sql");
      await sql`
        INSERT INTO workspaces (id, name, slug, created_by, created_at)
        VALUES ('ws_2', 'Other', 'other', 'user_1', ${NOW})
      `;
      await sql`
        INSERT INTO agent_profiles (
          id, workspace_id, handle, name, title, visibility, status,
          editable_config_json, config_revision, native_subagents_enabled, created_at, updated_at
        )
        VALUES (
          'cw_2', 'ws_2', 'foreign', 'Foreign', 'Reader', 'workspace', 'active',
          '{}'::jsonb, 1, false, ${NOW}, ${NOW}
        )
      `;
      await sql`UPDATE channel_agent_sessions SET agent_profile_id = 'cw_2' WHERE id = 'cas_1'`;

      await expect(migrate(sql)).rejects.toThrow(
        /cannot apply 0002_session_workspace_boundary: 1 cross-workspace legacy session.*cas_1\(channel=ws_1,agent=ws_2\)/i,
      );
      expect(await appliedMigrations(sql)).toEqual(["0001_p0_foundation.sql"]);

      await sql`UPDATE channel_agent_sessions SET agent_profile_id = 'cw_1' WHERE id = 'cas_1'`;
      expect(await migrate(sql)).toEqual([
        "0002_session_workspace_boundary.sql",
        "0003_runs_source_message_unique.sql",
        "0004_component_registry_constraints.sql",
        "0005_artifact_content_revision_scope.sql",
      ]);
    });
  }, 60_000);
});

describe("concurrency-critical constraints", () => {
  it("serializes current-generation assignment against concurrent retirement", async () => {
    await withTemporaryDatabase(async (url) => {
      const assigner = createSql(url);
      const retiree = createSql(url);
      try {
        await migrate(assigner);
        await seedRuntime(assigner);
        await assigner`
          INSERT INTO channel_agent_session_generations (
            id, channel_agent_session_id, generation, agent_version_id, session_revision_id,
            trueforge_session_id, effective_spec_hash, approval_policy_hash, state, created_at
          )
          VALUES (
            'gen_2', 'cas_1', 2, 'av_1', 'sr_1',
            'tf_sess_2', ${HASH}, ${HASH}, 'ready', ${NOW}
          )
        `;

        let currentGenerationLocked!: () => void;
        const pointerUpdateReachedTrigger = new Promise<void>((resolve) => {
          currentGenerationLocked = resolve;
        });
        const assignCurrent = assigner.begin(async (tx) => {
          await tx`
            UPDATE channel_agent_sessions
            SET current_generation_id = 'gen_2'
            WHERE id = 'cas_1'
          `;
          currentGenerationLocked();
          await tx`SELECT pg_sleep(0.25)`;
        });

        await pointerUpdateReachedTrigger;
        const retireConcurrently = retiree`
          UPDATE channel_agent_session_generations
          SET state = 'retired', retired_at = ${NOW}
          WHERE id = 'gen_2'
        `;
        const [assignmentResult, retirementResult] = await Promise.allSettled([
          assignCurrent,
          retireConcurrently,
        ]);

        expect(assignmentResult.status).toBe("fulfilled");
        expect(retirementResult.status).toBe("rejected");
        if (retirementResult.status === "rejected") {
          expect(String(retirementResult.reason)).toMatch(/current generation must be replaced/i);
        }
        const [session] = await assigner<
          { current_generation_id: string; generation_state: string }[]
        >`
          SELECT sessions.current_generation_id, generations.state AS generation_state
          FROM channel_agent_sessions AS sessions
          JOIN channel_agent_session_generations AS generations
            ON generations.id = sessions.current_generation_id
          WHERE sessions.id = 'cas_1'
        `;
        expect(session).toEqual({ current_generation_id: "gen_2", generation_state: "ready" });
      } finally {
        await Promise.all([assigner.end({ timeout: 5 }), retiree.end({ timeout: 5 })]);
      }
    });
  }, 60_000);

  it("rejects duplicate channel sequences and native-subagent sessions", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await expect(
        sql`
          INSERT INTO channel_events (
            id, channel_id, sequence, type, actor_type, actor_id, payload_json, created_at
          )
          VALUES ('evt_dup', 'ch_1', 0, 'message.created', 'human', 'user_1', '{}'::jsonb, ${NOW})
        `,
      ).rejects.toThrow(/channel_events_channel_sequence_uidx|unique/i);

      await expect(
        sql`UPDATE agent_profiles SET native_subagents_enabled = true WHERE id = 'cw_1'`,
      ).rejects.toThrow(/agent_profiles_native_subagents_off/i);

      await expect(
        sql`
          INSERT INTO channel_agent_sessions (
            id, workspace_id, channel_id, agent_profile_id, logical_agui_thread_id,
            last_delivered_channel_sequence, state, created_at, updated_at
          )
          VALUES ('cas_dup', 'ws_1', 'ch_1', 'cw_1', 'thread_dup', 0, 'active', ${NOW}, ${NOW})
        `,
      ).rejects.toThrow(/channel_agent_sessions_pair_uidx|unique/i);

      await sql`
        INSERT INTO workspaces (id, name, slug, created_by, created_at)
        VALUES ('ws_2', 'Other', 'other', 'user_1', ${NOW})
      `;
      await sql`
        INSERT INTO agent_profiles (
          id, workspace_id, handle, name, title, visibility, status,
          editable_config_json, config_revision, native_subagents_enabled, created_at, updated_at
        )
        VALUES (
          'cw_2', 'ws_2', 'foreign', 'Foreign', 'Reader', 'workspace', 'active',
          '{}'::jsonb, 1, false, ${NOW}, ${NOW}
        )
      `;
      await expect(
        sql`
          INSERT INTO channel_agent_sessions (
            id, workspace_id, channel_id, agent_profile_id, logical_agui_thread_id,
            last_delivered_channel_sequence, state, created_at, updated_at
          )
          VALUES ('cas_cross_workspace', 'ws_1', 'ch_1', 'cw_2', 'thread_cross', 0, 'active', ${NOW}, ${NOW})
        `,
      ).rejects.toThrow(/channel_agent_sessions_agent_workspace_fk|foreign key/i);
    });
  }, 60_000);

  it("enforces immutable drafts, task revisions, skill bindings and generation history", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await sql`
        INSERT INTO coworker_drafts (
          id, workspace_id, source_text_encrypted, proposal_json, effective_preview_json,
          draft_hash, revision, policy_revision, catalog_revision, state, created_by, expires_at, created_at
        )
        VALUES (
          'draft_1', 'ws_1', 'cipher', '{"name":"Research"}'::jsonb, '{"tools":[]}'::jsonb,
          ${HASH}, 1, 1, 1, 'awaiting_review', 'user_1', ${NOW}, ${NOW}
        )
      `;
      await expect(
        sql`UPDATE coworker_drafts SET proposal_json = '{"name":"Other"}'::jsonb WHERE id = 'draft_1'`,
      ).rejects.toThrow(/immutable/i);
      await expect(
        sql`
          INSERT INTO coworker_drafts (
            id, workspace_id, source_text_encrypted, proposal_json, effective_preview_json,
            draft_hash, revision, policy_revision, catalog_revision, state, created_by, expires_at, created_at
          )
          VALUES (
            'draft_2', 'ws_1', 'cipher', '{"name":"Other"}'::jsonb, '{"tools":[]}'::jsonb,
            ${HASH}, 1, 1, 1, 'draft', 'user_1', ${NOW}, ${NOW}
          )
        `,
      ).rejects.toThrow(/coworker_drafts_workspace_hash_revision_uidx|unique/i);

      await sql`
        INSERT INTO tasks (
          id, workspace_id, channel_id, title, status, current_revision,
          created_by_type, created_by_id, created_at, updated_at
        )
        VALUES ('task_1', 'ws_1', 'ch_1', 'Inspect', 'todo', 1, 'human', 'user_1', ${NOW}, ${NOW})
      `;
      await sql`
        INSERT INTO task_revisions (
          id, task_id, revision, data_json, data_hash, changed_fields_json, actor_type, actor_id, command_id, created_at
        )
        VALUES ('trev_1', 'task_1', 1, '{"title":"Inspect"}'::jsonb, ${HASH}, '["title"]'::jsonb, 'human', 'user_1', 'cmd_1', ${NOW})
      `;
      await expect(
        sql`
          INSERT INTO task_revisions (
            id, task_id, revision, data_json, data_hash, changed_fields_json, actor_type, actor_id, command_id, created_at
          )
          VALUES ('trev_dup', 'task_1', 1, '{"title":"Inspect"}'::jsonb, ${HASH}, '[]'::jsonb, 'human', 'user_1', 'cmd_2', ${NOW})
        `,
      ).rejects.toThrow(/task_revisions_unique|unique/i);
      await expect(
        sql`UPDATE task_revisions SET data_hash = ${HASH} WHERE id = 'trev_1'`,
      ).rejects.toThrow(/append-only/i);

      await sql`
        INSERT INTO task_grants (
          id, task_id, channel_id, subject_type, subject_id, allowed_operations_json,
          allowed_fields_json, allowed_transitions_json, policy_revision, granted_by, created_at
        )
        VALUES (
          'tg_1', 'task_1', 'ch_1', 'coworker', 'cw_1', '["create"]'::jsonb,
          '["title"]'::jsonb, '[]'::jsonb, 1, 'user_1', ${NOW}
        )
      `;

      await sql`
        INSERT INTO skills (id, workspace_id, stable_name, display_name, owner_user_id, visibility, status, created_at, updated_at)
        VALUES ('skill_1', 'ws_1', 'inspect', 'Inspect', 'user_1', 'private', 'active', ${NOW}, ${NOW})
      `;
      await sql`
        INSERT INTO skill_versions (
          id, skill_id, version, state, manifest_json, manifest_hash, skill_markdown_blob_key,
          content_hash, source_run_id, source_step_ids_json, created_by, created_at, published_at
        )
        VALUES (
          'skillv_1', 'skill_1', 1, 'published', '{}'::jsonb, ${HASH}, 'blob_1',
          ${HASH}, 'run_1', '["step_1"]'::jsonb, 'user_1', ${NOW}, ${NOW}
        )
      `;
      await expect(
        sql`
          INSERT INTO skill_versions (
            id, skill_id, version, state, manifest_json, manifest_hash, skill_markdown_blob_key,
            content_hash, created_by, created_at, published_at
          )
          VALUES ('skillv_dup', 'skill_1', 1, 'published', '{}'::jsonb, ${HASH}, 'blob_2', ${HASH}, 'user_1', ${NOW}, ${NOW})
        `,
      ).rejects.toThrow(/skill_versions_unique|unique/i);

      await sql`
        INSERT INTO agent_skill_bindings (
          id, agent_profile_id, agent_version_id, skill_version_id, state, attached_by, attached_at
        )
        VALUES ('bind_1', 'cw_1', 'av_1', 'skillv_1', 'active', 'user_1', ${NOW})
      `;
      await expect(
        sql`
          INSERT INTO agent_skill_bindings (
            id, agent_profile_id, agent_version_id, skill_version_id, state, attached_by, attached_at
          )
          VALUES ('bind_dup', 'cw_1', 'av_1', 'skillv_1', 'active', 'user_1', ${NOW})
        `,
      ).rejects.toThrow(/agent_skill_bindings_active_uidx|unique/i);

      await expect(
        sql`
          INSERT INTO channel_agent_session_generations (
            id, channel_agent_session_id, generation, session_revision_id, trueforge_session_id,
            effective_spec_hash, approval_policy_hash, state, created_at
          )
          VALUES ('gen_dup', 'cas_1', 1, 'sr_1', 'tf_sess_dup', ${HASH}, ${HASH}, 'ready', ${NOW})
        `,
      ).rejects.toThrow(/channel_agent_session_generations_unique|unique/i);
      await expect(
        sql`UPDATE channel_agent_session_generations SET trueforge_session_id = 'tf_other' WHERE id = 'gen_1'`,
      ).rejects.toThrow(/immutable/i);

      await expect(
        sql`
          UPDATE channel_agent_session_generations
          SET state = 'retired', retired_at = ${NOW}
          WHERE id = 'gen_1'
        `,
      ).rejects.toThrow(/current generation must be replaced/i);
      await sql`
        INSERT INTO channel_agent_session_generations (
          id, channel_agent_session_id, generation, agent_version_id, session_revision_id,
          trueforge_session_id, effective_spec_hash, approval_policy_hash, state, created_at
        )
        VALUES (
          'gen_2', 'cas_1', 2, 'av_1', 'sr_1',
          'tf_sess_2', ${HASH}, ${HASH}, 'ready', ${NOW}
        )
      `;
      await sql`UPDATE channel_agent_sessions SET current_generation_id = 'gen_2' WHERE id = 'cas_1'`;
      await sql`
        UPDATE channel_agent_session_generations
        SET state = 'retired', retired_at = ${NOW}
        WHERE id = 'gen_1'
      `;
      await expect(
        sql`
          UPDATE channel_agent_session_generations
          SET state = 'ready', retired_at = NULL
          WHERE id = 'gen_1'
        `,
      ).rejects.toThrow(/cannot be reopened/i);
    });
  }, 60_000);

  it("allows one remote-active turn and unique PauseGroup/Resume/decision rows", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await expect(
        sql`
          INSERT INTO turn_queue_items (
            id, channel_agent_session_id, run_step_id, input_type,
            input_payload_redacted_json, fifo_sequence, state, created_at
          )
          VALUES ('q_unbound', 'cas_1', 'step_1', 'normal', '{}'::jsonb, 1, 'claimed', ${NOW})
        `,
      ).rejects.toThrow(/turn_queue_items_bound_generation_check/i);
      await sql`
        INSERT INTO turn_queue_items (
          id, channel_agent_session_id, run_step_id, bound_session_generation_id, input_type,
          input_payload_redacted_json, fifo_sequence, state, created_at
        )
        VALUES ('q_2', 'cas_1', 'step_1', 'gen_1', 'normal', '{}'::jsonb, 2, 'claimed', ${NOW})
      `;
      await sql`
        INSERT INTO channel_agent_session_generations (
          id, channel_agent_session_id, generation, agent_version_id, session_revision_id,
          trueforge_session_id, effective_spec_hash, approval_policy_hash, state, created_at
        )
        VALUES (
          'gen_other', 'cas_1', 2, 'av_1', 'sr_1',
          'tf_sess_other', ${HASH}, ${HASH}, 'ready', ${NOW}
        )
      `;
      await expect(
        sql`
          INSERT INTO agent_turns (
            id, run_step_id, channel_agent_session_id, session_generation_id, queue_item_id,
            application_run_token, agui_run_id, input_type, state
          )
          VALUES (
            'turn_crossed', 'step_1', 'cas_1', 'gen_other', 'q_2',
            'token_crossed', 'agui_run_crossed', 'normal', 'intended'
          )
        `,
      ).rejects.toThrow(/agent_turns_queue_binding_fk|foreign key/i);
      await expect(
        sql`
          INSERT INTO agent_turns (
            id, run_step_id, channel_agent_session_id, session_generation_id, queue_item_id,
            application_run_token, agui_run_id, input_type, state
          )
          VALUES ('turn_dup', 'step_1', 'cas_1', 'gen_1', 'q_2', 'token_2', 'agui_run_2', 'normal', 'creating')
        `,
      ).rejects.toThrow(/agent_turns_remote_active_uidx|unique/i);

      await sql`
        INSERT INTO pause_groups (
          id, agent_turn_id, trueforge_turn_id, generation, state, required_action_count
        )
        VALUES ('pg_1', 'turn_1', 'tf_turn_1', 1, 'collecting', 1)
      `;
      await expect(
        sql`
          INSERT INTO pause_groups (
            id, agent_turn_id, trueforge_turn_id, generation, state, required_action_count
          )
          VALUES ('pg_dup', 'turn_1', 'tf_turn_2', 1, 'collecting', 1)
        `,
      ).rejects.toThrow(/pause_groups_turn_uidx|unique/i);

      await sql`
        INSERT INTO required_actions (
          id, pause_group_id, provider_action_id, action_type, state, payload_redacted_json, payload_hash, created_at
        )
        VALUES ('ra_1', 'pg_1', 'prov_1', 'approval', 'pending', '{}'::jsonb, ${HASH}, ${NOW})
      `;
      await expect(
        sql`
          INSERT INTO required_actions (
            id, pause_group_id, provider_action_id, action_type, state, payload_redacted_json, payload_hash, created_at
          )
          VALUES ('ra_dup', 'pg_1', 'prov_1', 'approval', 'pending', '{}'::jsonb, ${HASH}, ${NOW})
        `,
      ).rejects.toThrow(/required_actions_provider_uidx|unique/i);

      await sql`
        INSERT INTO pause_resumes (
          id, pause_group_id, expected_generation, application_run_token, response_payload_hash,
          response_payload_ciphertext, state, created_at
        )
        VALUES ('pr_1', 'pg_1', 1, 'token_1', ${HASH}, 'cipher', 'intended', ${NOW})
      `;
      await expect(
        sql`
          INSERT INTO pause_resumes (
            id, pause_group_id, expected_generation, application_run_token, response_payload_hash,
            response_payload_ciphertext, state, created_at
          )
          VALUES ('pr_dup', 'pg_1', 1, 'token_1', ${HASH}, 'cipher', 'intended', ${NOW})
        `,
      ).rejects.toThrow(/pause_resumes_pause_group_id_key|unique/i);

      await sql`
        INSERT INTO action_proposals (
          id, required_action_id, run_id, run_step_id, agent_turn_id, tool_call_id, session_generation_id,
          approval_policy_hash, connector_binding_id, tool_name, observed_descriptor_hash, acting_identity_json,
          normalized_arguments_redacted_json, arguments_hash, target_redacted_json, target_hash,
          risk_class, expected_effect, state, expires_at
        )
        VALUES (
          'ap_1', 'ra_1', 'run_1', 'step_1', 'turn_1', 'tc_write', 'gen_1',
          ${HASH}, 'cb_1', 'WRITE', ${HASH}, '{}'::jsonb,
          '{}'::jsonb, ${HASH}, '{}'::jsonb, ${HASH},
          'high', 'update field', 'proposed', ${NOW}
        )
      `;
      const [first, second] = await Promise.all([
        sql`
          UPDATE action_proposals
          SET state = 'allowed', decided_by = 'user_1', decided_at = ${NOW}
          WHERE id = 'ap_1' AND state = 'proposed'
          RETURNING id
        `,
        sql`
          UPDATE action_proposals
          SET state = 'denied', decided_by = 'user_1', decided_at = ${NOW}
          WHERE id = 'ap_1' AND state = 'proposed'
          RETURNING id
        `,
      ]);
      expect(first.length + second.length).toBe(1);

      await expect(
        sql`UPDATE action_proposals SET arguments_hash = ${ALT_HASH} WHERE id = 'ap_1'`,
      ).rejects.toThrow(/approval authority is immutable/i);
      const decision = await sql<{ state: string }[]>`
        SELECT state FROM action_proposals WHERE id = 'ap_1'
      `;
      const oppositeDecision = decision[0]?.state === "allowed" ? "denied" : "allowed";
      await expect(
        sql`UPDATE action_proposals SET state = ${oppositeDecision} WHERE id = 'ap_1'`,
      ).rejects.toThrow(/cannot be reassigned/i);
      await expect(sql`DELETE FROM action_proposals WHERE id = 'ap_1'`).rejects.toThrow(
        /append-only/i,
      );
    });
  }, 60_000);

  it("enforces controlled UI revisions, interaction lifecycle, grant use, and append-only audit", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await sql`
        INSERT INTO ui_instance_revisions (
          id, ui_instance_id, revision_kind, revision, component_version_id, renderer_profile_hash,
          validator_policy_version, render_node_set_json, render_node_set_hash, render_payload_json,
          render_payload_hash, render_manifest_json, manifest_hash, validated_props_json, validated_props_hash,
          accessible_summary, content_hash, validation_state, created_at
        )
        VALUES (
          'uir_1', 'ui_1', 'render', 0, 'compv_1', ${HASH},
          'v1', '[]'::jsonb, ${HASH}, '{}'::jsonb,
          ${HASH}, '{}'::jsonb, ${HASH}, '{}'::jsonb, ${HASH},
          'A table', ${HASH}, 'valid', ${NOW}
        )
      `;
      await expect(
        sql`
          INSERT INTO ui_instance_revisions (
            id, ui_instance_id, revision_kind, revision, component_version_id, renderer_profile_hash,
            validator_policy_version, render_node_set_json, render_node_set_hash, render_payload_json,
            render_payload_hash, render_manifest_json, manifest_hash, validated_props_json, validated_props_hash,
            accessible_summary, content_hash, validation_state, created_at
          )
          VALUES (
            'uir_dup', 'ui_1', 'render', 0, 'compv_1', ${HASH},
            'v1', '[]'::jsonb, ${HASH}, '{}'::jsonb,
            ${HASH}, '{}'::jsonb, ${HASH}, '{}'::jsonb, ${HASH},
            'A table', ${HASH}, 'valid', ${NOW}
          )
        `,
      ).rejects.toThrow(/ui_instance_revisions_unique|unique/i);

      await expect(
        sql`
          INSERT INTO ui_instance_revisions (
            id, ui_instance_id, revision_kind, revision, validator_policy_version,
            scoped_state_json, scoped_state_hash, accessible_summary, content_hash, validation_state, created_at
          )
          VALUES (
            'uir_bad', 'ui_1', 'state', 0, 'v1',
            '{}'::jsonb, ${HASH}, 'not allowed on state', ${HASH}, 'valid', ${NOW}
          )
        `,
      ).rejects.toThrow(/ui_instance_revisions_kind_shape_check/i);
      await expect(
        sql`UPDATE ui_instance_revisions SET content_hash = ${ALT_HASH} WHERE id = 'uir_1'`,
      ).rejects.toThrow(/append-only/i);
      await expect(sql`DELETE FROM ui_instance_revisions WHERE id = 'uir_1'`).rejects.toThrow(
        /append-only/i,
      );

      await sql`
        INSERT INTO ui_interactions (
          id, ui_instance_id, render_revision, action_grant_id, render_node_id, handler_key, intent_name,
          payload_redacted_json, payload_hash, idempotency_key_hash, actor_user_id, client_kind, state, created_at
        )
        VALUES (
          'int_1', 'ui_1', 0, 'ag_1', 'node_that_is_not_a_component_id', 'select_row', 'select',
          '{}'::jsonb, ${HASH}, ${HASH}, 'user_1', 'registry', 'prepared', ${NOW}
        )
      `;
      const nodes = await sql<{ render_node_id: string }[]>`
        SELECT render_node_id FROM ui_interactions WHERE id = 'int_1'
      `;
      expect(nodes[0]?.render_node_id).toBe("node_that_is_not_a_component_id");

      await expect(
        sql`
          INSERT INTO ui_interactions (
            id, ui_instance_id, render_revision, action_grant_id, render_node_id, handler_key, intent_name,
            payload_redacted_json, payload_hash, idempotency_key_hash, actor_user_id, client_kind, state, created_at
          )
          VALUES (
            'int_dup', 'ui_1', 0, 'ag_1', 'node_1', 'select_row', 'select',
            '{}'::jsonb, ${HASH}, ${HASH}, 'user_1', 'registry', 'prepared', ${NOW}
          )
        `,
      ).rejects.toThrow(/ui_interactions_idempotency_uidx|unique/i);

      await expect(
        sql`
          INSERT INTO ui_interactions (
            id, ui_instance_id, render_revision, action_grant_id, render_node_id, handler_key, intent_name,
            payload_redacted_json, payload_hash, interaction_token_hash, idempotency_key_hash,
            actor_user_id, client_kind, state, created_at
          )
          VALUES (
            'int_token', 'ui_1', 0, 'ag_1', 'node_1', 'select_row', 'select',
            '{}'::jsonb, ${HASH}, ${HASH}, ${`sha256:${"cd".repeat(32)}`},
            'user_1', 'registry', 'token_issued', ${NOW}
          )
        `,
      ).rejects.toThrow(/ui_interactions_lifecycle_check/i);

      await expect(
        sql`
          INSERT INTO ui_interactions (
            id, ui_instance_id, render_revision, action_grant_id, render_node_id, handler_key, intent_name,
            payload_redacted_json, payload_hash, idempotency_key_hash, actor_user_id, client_kind, state, created_at
          )
          VALUES (
            'int_confirm', 'ui_1', 0, 'ag_1', 'node_1', 'select_row', 'select',
            '{}'::jsonb, ${HASH}, ${`sha256:${"ef".repeat(32)}`}, 'user_1', 'registry', 'awaiting_confirmation', ${NOW}
          )
        `,
      ).rejects.toThrow(/ui_interactions_(state|lifecycle)_check/i);

      await expect(
        sql`UPDATE ui_surface_grants SET use_count = 9 WHERE id = 'ag_1'`,
      ).rejects.toThrow(/ui_surface_grants_use_check/i);
      await expect(
        sql`UPDATE ui_surface_grants SET handler_key = 'other_handler' WHERE id = 'ag_1'`,
      ).rejects.toThrow(/authority is immutable/i);
      await sql`UPDATE ui_surface_grants SET use_count = 1 WHERE id = 'ag_1'`;
      await expect(
        sql`UPDATE ui_surface_grants SET use_count = 0 WHERE id = 'ag_1'`,
      ).rejects.toThrow(/use_count cannot decrease/i);
      await sql`UPDATE ui_surface_grants SET revoked_at = ${NOW} WHERE id = 'ag_1'`;
      await expect(
        sql`UPDATE ui_surface_grants SET revoked_at = NULL WHERE id = 'ag_1'`,
      ).rejects.toThrow(/revocation is single-assignment/i);
      await expect(sql`DELETE FROM ui_surface_grants WHERE id = 'ag_1'`).rejects.toThrow(
        /append-only/i,
      );

      await sql`
        INSERT INTO audit_events (
          id, workspace_id, channel_id, actor_type, actor_id, action, target_type, target_id,
          redacted_payload_json, payload_hash, created_at
        )
        VALUES (
          'audit_1', 'ws_1', 'ch_1', 'human', 'user_1', 'task.created', 'task', 'task_1',
          '{}'::jsonb, ${HASH}, ${NOW}
        )
      `;
      await expect(
        sql`UPDATE audit_events SET action = 'task.updated' WHERE id = 'audit_1'`,
      ).rejects.toThrow(/append-only/i);
      await expect(sql`DELETE FROM audit_events WHERE id = 'audit_1'`).rejects.toThrow(
        /append-only/i,
      );

      const fks = await sql<{ conname: string }[]>`
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
        JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = 'ui_interactions'
          AND att.attname = 'render_node_id'
          AND con.contype = 'f'
      `;
      expect(fks).toHaveLength(0);
    });
  }, 60_000);
});
