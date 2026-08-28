import { describe, expect, it } from "vitest";
import { materializeTaskGrantFromOperations } from "@forgeroom/domain";
import { createMemoryWorkspaceStore } from "../workspace/store";
import { createWorkspaceService } from "../workspace/service";
import { customAguiEvent } from "../workspace/event-builders";
import {
  TASK_RECORD_UPSERT_TOOL_DESCRIPTOR,
  executeTaskRecordUpsertTool,
  taskRecordUpsertPolicy,
  taskRecordUpsertToolArgsSchema,
} from "./index";

describe("TaskRecord internal tool", () => {
  it("parses create and update argument shapes", () => {
    expect(
      taskRecordUpsertToolArgsSchema.parse({
        channel_id: "ch_1",
        idempotency_key: "cmd_1",
        title: "Inspect",
        description: null,
        status: "todo",
        assignee_type: null,
        assignee_id: null,
        source_message_id: null,
        source_run_id: "run_1",
        due_at: null,
      }).title,
    ).toBe("Inspect");

    expect(() =>
      taskRecordUpsertToolArgsSchema.parse({
        channel_id: "ch_1",
        task_id: "task_1",
        idempotency_key: "cmd_2",
        status: "in_progress",
      }),
    ).toThrow();
  });

  it("rejects malformed optional values instead of silently changing their meaning", () => {
    for (const invalid of [
      { status: "started" },
      { description: 42 },
      { assignee_type: "robot" },
      { due_at: false },
      { unexpected: true },
    ]) {
      expect(
        taskRecordUpsertToolArgsSchema.safeParse({
          channel_id: "ch_1",
          idempotency_key: "cmd_invalid",
          title: "Inspect",
          ...invalid,
        }).success,
      ).toBe(false);
    }
  });

  it("rejects create-only provenance fields on updates", () => {
    const parsed = taskRecordUpsertToolArgsSchema.safeParse({
      channel_id: "ch_1",
      task_id: "task_1",
      expected_revision: 1,
      idempotency_key: "cmd_update_provenance",
      source_run_id: "run_other",
    });
    expect(parsed.success).toBe(false);
  });

  it("exposes a reviewed descriptor and ToolPolicyDefinition", () => {
    expect(TASK_RECORD_UPSERT_TOOL_DESCRIPTOR.name).toBe("records.task.upsert.v1");
    expect(taskRecordUpsertPolicy.toolName).toBe("records.task.upsert.v1");
    expect(taskRecordUpsertPolicy.riskClass).toBe("write");
    expect(taskRecordUpsertPolicy.idempotency).toBe("verified");
  });

  it("creates and updates tasks for a granted coworker", async () => {
    const store = createMemoryWorkspaceStore();
    const workspace = createWorkspaceService({ store });
    const coworker = await workspace.seedCoworker({
      workspaceId: "workspace_1",
      createdBy: "user_owner",
      handle: "ops",
      name: "Ops",
      title: "Operator",
    });
    const channel = await store.insertChannelWithOwner(
      {
        id: "channel_task_tool",
        workspaceId: "workspace_1",
        name: "Ops",
        missionBrief: "Track",
        summary: null,
        policyJson: {},
        nextSequence: 1,
        status: "active",
        createdBy: "user_owner",
        createdAt: "2026-08-27T00:00:00.000Z",
        updatedAt: "2026-08-27T00:00:00.000Z",
      },
      {
        channelId: "channel_task_tool",
        participantType: "coworker",
        participantId: coworker.id,
        role: "member",
        joinedAt: "2026-08-27T00:00:00.000Z",
        removedAt: null,
      },
      {
        id: "evt_channel_task_tool",
        type: "channel.created",
        actorType: "system",
        actorId: "user_owner",
        createdAt: "2026-08-27T00:00:00.000Z",
        draft: {
          actorKind: "system",
          aguiEvent: customAguiEvent("channel.created"),
        },
      },
    );
    void channel;

    const denied = await executeTaskRecordUpsertTool(workspace, coworker.id, {
      channel_id: "channel_task_tool",
      idempotency_key: "denied_create",
      title: "Blocked",
      description: null,
      status: "todo",
      assignee_type: null,
      assignee_id: null,
      source_message_id: null,
      source_run_id: null,
      due_at: null,
    });
    expect(denied.ok).toBe(false);

    const material = materializeTaskGrantFromOperations(["create", "update_status"]);
    await store.replaceActiveTaskGrantsForSubject(
      coworker.id,
      [
        {
          id: "tgrant_1",
          taskId: null,
          channelId: "channel_task_tool",
          subjectType: "coworker",
          subjectId: coworker.id,
          allowedOperationsJson: material.allowedOperations,
          allowedFieldsJson: material.allowedFields,
          allowedTransitionsJson: material.allowedTransitions,
          policyRevision: 1,
          grantedBy: "user_owner",
          createdAt: "2026-08-27T00:00:00.000Z",
          revokedAt: null,
        },
      ],
      "2026-08-27T00:00:00.000Z",
    );

    const created = await executeTaskRecordUpsertTool(workspace, coworker.id, {
      channel_id: "channel_task_tool",
      idempotency_key: "create_1",
      title: "Inspect connector",
      description: "Read-only",
      status: "todo",
      assignee_type: "coworker",
      assignee_id: coworker.id,
      source_message_id: null,
      source_run_id: null,
      due_at: null,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await executeTaskRecordUpsertTool(workspace, coworker.id, {
      channel_id: "channel_task_tool",
      task_id: created.value.id,
      expected_revision: 1,
      idempotency_key: "update_1",
      status: "in_progress",
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value.status).toBe("in_progress");
    expect(updated.value.current_revision).toBe(2);
  });
});
