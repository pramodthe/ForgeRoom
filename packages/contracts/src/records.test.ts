import { describe, expect, it } from "vitest";
import { coworkerDraftConfirmCommandSchema, coworkerDraftSchema } from "./coworkers";
import { taskGrantSchema, taskRecordV1Schema, taskRevisionSchema } from "./tasks";
import { skillBindingSchema, skillDraftSchema, skillVersionSchema } from "./skills";
import { componentVersionSchema } from "./components";
import { HASH, NOW } from "./test-helpers";

describe("coworker drafts", () => {
  it("parses a closed draft and rejects grant submission on confirm", () => {
    const draft = coworkerDraftSchema.parse({
      schemaVersion: 1,
      id: "draft_1",
      workspace_id: "ws_1",
      revision: 1,
      draft_hash: HASH,
      policy_revision: 3,
      catalog_revision: 2,
      state: "awaiting_review",
      proposal: {
        schemaVersion: 1,
        name: "Research",
        handle: "research",
        title: "Read-only researcher",
        standing_instructions: "Cite sources.",
        model_preset: "default",
        native_subagents_enabled: false,
        channel_ids: ["ch_1"],
        budget: { max_turn_tokens: 12000, max_tool_calls: 20 },
        task_record_grants: [{ channel_id: "ch_1", operations: ["create"] }],
        tool_grants: ["GITHUB_READ"],
        skill_version_ids: [],
        component_version_ids: ["componentv_table"],
      },
      effective_preview: {
        schemaVersion: 1,
        model: "default",
        tools: ["GITHUB_READ"],
        skills: [],
        components: ["componentv_table"],
        account: "svc_fixed",
        channels: ["ch_1"],
        sandbox: false,
        denials: ["write"],
        native_subagents_enabled: false,
      },
      created_by: "user_1",
      expires_at: NOW,
      created_at: NOW,
    });
    expect(draft.proposal.native_subagents_enabled).toBe(false);
    expect(
      coworkerDraftConfirmCommandSchema.safeParse({
        draft_revision: 1,
        draft_hash: HASH,
        policy_revision: 3,
        catalog_revision: 2,
        idempotency_key: "idem_1",
        tool_grants: ["EXTRA_WRITE"],
      }).success,
    ).toBe(false);
  });
});

describe("tasks and skills", () => {
  it("parses TaskRecord, TaskRevision and TaskGrant as closed versioned objects", () => {
    const task = taskRecordV1Schema.parse({
      schemaVersion: 1,
      id: "task_1",
      workspace_id: "ws_1",
      channel_id: "ch_1",
      title: "Inspect fixture",
      description: null,
      status: "todo",
      assignee_type: "coworker",
      assignee_id: "cw_1",
      source_message_id: "msg_1",
      source_run_id: "run_1",
      due_at: null,
      current_revision: 1,
      created_by_type: "human",
      created_by_id: "user_1",
      created_at: NOW,
      updated_at: NOW,
    });
    expect(
      taskRevisionSchema.parse({
        schemaVersion: 1,
        id: "trev_1",
        task_id: task.id,
        revision: 1,
        data: { title: task.title, status: task.status },
        data_hash: HASH,
        changed_fields: ["title"],
        actor_type: "human",
        actor_id: "user_1",
        command_id: "cmd_1",
        created_at: NOW,
      }).revision,
    ).toBe(1);
    expect(
      taskGrantSchema.parse({
        schemaVersion: 1,
        id: "tg_1",
        task_id: task.id,
        channel_id: "ch_1",
        subject_type: "coworker",
        subject_id: "cw_1",
        allowed_operations: ["create", "update_status"],
        allowed_fields: ["status", "title"],
        allowed_transitions: [{ from: "todo", to: "in_progress" }],
        policy_revision: 1,
        granted_by: "user_1",
        created_at: NOW,
        revoked_at: null,
      }).allowed_operations,
    ).toContain("create");
  });

  it("parses private skill draft, immutable version and binding", () => {
    const draft = skillDraftSchema.parse({
      schemaVersion: 1,
      id: "sd_1",
      workspace_id: "ws_1",
      source_run_id: "run_1",
      source_step_ids: ["step_1"],
      source_content_hash: HASH,
      when_to_use: "Repeat the verified write",
      inputs: ["issue id"],
      method: ["read", "propose", "verify"],
      validation: "field equals expected value",
      output: "updated record",
      failures: ["descriptor drift"],
      required_tools: ["WRITE"],
      required_components: ["componentv_table"],
      required_approvals: ["WRITE"],
      state: "draft",
      created_by: "user_1",
      created_at: NOW,
    });
    const version = skillVersionSchema.parse({
      schemaVersion: 1,
      id: "skillv_1",
      skill_id: "skill_1",
      version: 1,
      state: "published",
      manifest_hash: HASH,
      content_hash: HASH,
      source_run_id: draft.source_run_id,
      source_step_ids: draft.source_step_ids,
      required_tools: draft.required_tools,
      required_components: draft.required_components,
      required_approvals: draft.required_approvals,
      created_by: "user_1",
      created_at: NOW,
      published_at: NOW,
    });
    expect(version.version).toBe(1);
    expect(
      skillBindingSchema.parse({
        schemaVersion: 1,
        id: "bind_1",
        coworker_id: "cw_1",
        skill_version_id: version.id,
        state: "active",
        attached_by: "user_1",
        attached_at: NOW,
        detached_at: null,
      }).state,
    ).toBe("active");
  });
});

describe("controlled components", () => {
  it("accepts P0 agent-tool manifests and rejects mixing server-only exposure", () => {
    expect(
      componentVersionSchema.parse({
        schemaVersion: 1,
        id: "componentv_table",
        stable_name: "DataTable",
        semantic_version: "1.0.0",
        exposure: "agent_tool",
        confirmation_policy: "none",
        model_description: "Render a bounded table",
        argument_schema: { type: "object" },
        renderer_key: "DataTable@1.0.0",
        descriptor_hash: HASH,
        declared_data_functions: ["rows"],
        declared_interaction_intents: ["filter"],
      }).exposure,
    ).toBe("agent_tool");
    expect(
      componentVersionSchema.safeParse({
        schemaVersion: 1,
        id: "componentv_approval",
        stable_name: "ApprovalCard",
        semantic_version: "1.0.0",
        exposure: "agent_tool",
        confirmation_policy: "trusted_host",
        model_description: "Approval",
        argument_schema: {},
        renderer_key: "ApprovalCard@1.0.0",
        descriptor_hash: HASH,
        declared_data_functions: [],
        declared_interaction_intents: [],
      }).success,
    ).toBe(false);
  });
});
