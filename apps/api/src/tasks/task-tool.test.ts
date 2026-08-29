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

    const material = materializeTaskGrantFromOperations([
      "create",
      "update_status",
      "update_fields",
    ]);
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

    const sessionId = "cas_channel_task_tool_ops";
    const persistGeneration = async (
      generationId: string,
      generation: number,
      applicationToolNames: string[],
    ) => {
      const timestamp = `2026-08-27T00:00:0${generation}.000Z`;
      await store.persistProvisionedSession({
        logicalSession: {
          id: sessionId,
          workspaceId: "workspace_1",
          channelId: "channel_task_tool",
          agentProfileId: coworker.id,
          logicalAguiThreadId: "thread_channel_task_tool_ops",
          currentGenerationId: generationId,
          lastDeliveredChannelSequence: 0,
          state: "active",
          createdAt: "2026-08-27T00:00:00.000Z",
          updatedAt: timestamp,
        },
        revision: {
          id: `revision_${generation}`,
          agentProfileId: coworker.id,
          sourceConfigRevision: generation,
          effectiveConfigRedactedJson: {
            application_tool_names: applicationToolNames,
          },
          effectiveSpecHash: `sha256:spec_${generation}`,
          approvalPolicyHash: `sha256:policy_${generation}`,
          createdBy: "user_owner",
          createdAt: timestamp,
        },
        generation: {
          id: generationId,
          channelAgentSessionId: sessionId,
          generation,
          agentVersionId: null,
          sessionRevisionId: `revision_${generation}`,
          trueforgeSessionId: `tf_session_${generation}`,
          effectiveSpecHash: `sha256:spec_${generation}`,
          approvalPolicyHash: `sha256:policy_${generation}`,
          activeTurnId: null,
          state: "ready",
          createdAt: timestamp,
          retiredAt: null,
        },
      });
    };
    const guardFor = (generationId: string, generation: number) => ({
      channelAgentSessionId: sessionId,
      generationId,
      expectedGeneration: generation,
      workspaceId: "workspace_1",
      channelId: "channel_task_tool",
      coworkerId: coworker.id,
      applicationToolName: TASK_RECORD_UPSERT_TOOL_DESCRIPTOR.name,
    });

    await persistGeneration("generation_1", 1, [TASK_RECORD_UPSERT_TOOL_DESCRIPTOR.name]);
    const generationBound = await executeTaskRecordUpsertTool(
      workspace,
      coworker.id,
      {
        channel_id: "channel_task_tool",
        task_id: created.value.id,
        expected_revision: 2,
        idempotency_key: "update_generation_1",
        title: "Inspect connector safely",
      },
      guardFor("generation_1", 1),
    );
    expect(generationBound.ok).toBe(true);

    await persistGeneration("generation_2", 2, [TASK_RECORD_UPSERT_TOOL_DESCRIPTOR.name]);
    const stale = await executeTaskRecordUpsertTool(
      workspace,
      coworker.id,
      {
        channel_id: "channel_task_tool",
        task_id: created.value.id,
        expected_revision: 3,
        idempotency_key: "stale_generation_1",
        title: "Stale mutation",
      },
      guardFor("generation_1", 1),
    );
    expect(stale).toMatchObject({
      ok: false,
      error: { code: "conflict", details: { reason: "stale_generation" } },
    });

    await persistGeneration("generation_3", 3, []);
    const revoked = await executeTaskRecordUpsertTool(
      workspace,
      coworker.id,
      {
        channel_id: "channel_task_tool",
        task_id: created.value.id,
        expected_revision: 3,
        idempotency_key: "revoked_generation_3",
        title: "Revoked mutation",
      },
      guardFor("generation_3", 3),
    );
    expect(revoked).toMatchObject({
      ok: false,
      error: { code: "conflict", details: { reason: "application_tool_not_offered" } },
    });
  });
});
