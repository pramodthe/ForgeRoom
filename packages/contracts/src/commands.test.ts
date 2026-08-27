import { describe, expect, it } from "vitest";
import {
  channelArchiveCommandSchema,
  channelCreateCommandSchema,
  channelParticipantAddCommandSchema,
  channelParticipantRemoveCommandSchema,
  channelPinCreateCommandSchema,
  channelPinRemoveCommandSchema,
  channelUpdateCommandSchema,
} from "./channels";
import {
  coworkerDisableCommandSchema,
  coworkerDraftConfirmCommandSchema,
  coworkerDraftCreateCommandSchema,
  coworkerDraftRejectCommandSchema,
  coworkerDraftReviseCommandSchema,
  coworkerUpdateCommandSchema,
} from "./coworkers";
import { connectionReconnectCommandSchema, connectionTestCommandSchema } from "./connections";
import { internalWorkerCommandSchema } from "./boundary";
import { runCancelCommandSchema, runSteerCommandSchema, runStepCancelCommandSchema } from "./runs";
import {
  skillBindingCreateCommandSchema,
  skillBindingDeleteCommandSchema,
  skillDraftCreateCommandSchema,
  skillDraftPublishCommandSchema,
  skillDraftReviseCommandSchema,
} from "./skills";
import { taskCreateCommandSchema, taskUpdateCommandSchema } from "./tasks";
import { HASH, NOW } from "./test-helpers";

describe("P0 command surface", () => {
  it("defines closed channel, participant and pin mutation commands", () => {
    expect(
      channelCreateCommandSchema.parse({
        schemaVersion: 1,
        name: "Research",
        mission_brief: "Verify evidence",
        idempotency_key: "idem_1",
      }).name,
    ).toBe("Research");
    expect(
      channelUpdateCommandSchema.safeParse({
        schemaVersion: 1,
        idempotency_key: "idem_2",
      }).success,
    ).toBe(false);
    expect(
      channelArchiveCommandSchema.safeParse({
        schemaVersion: 1,
        idempotency_key: "idem_3",
        archive_everything: true,
      }).success,
    ).toBe(false);
    expect(
      channelParticipantAddCommandSchema.parse({
        schemaVersion: 1,
        participant_type: "coworker",
        participant_id: "cw_1",
        role: "member",
        idempotency_key: "idem_4",
      }).participant_id,
    ).toBe("cw_1");
    expect(
      channelParticipantRemoveCommandSchema.parse({
        schemaVersion: 1,
        idempotency_key: "idem_5",
      }).schemaVersion,
    ).toBe(1);
    expect(
      channelPinCreateCommandSchema.safeParse({
        schemaVersion: 1,
        source_message_id: "msg_1",
        source_artifact_id: "artifact_1",
        label: "conflicting",
        idempotency_key: "idem_6",
      }).success,
    ).toBe(false);
    expect(
      channelPinRemoveCommandSchema.parse({
        schemaVersion: 1,
        idempotency_key: "idem_7",
      }).schemaVersion,
    ).toBe(1);
  });

  it("defines revision-bound coworker draft and lifecycle commands", () => {
    expect(
      coworkerDraftCreateCommandSchema.parse({
        schemaVersion: 1,
        request: "Create a read-only researcher",
        idempotency_key: "idem_8",
      }).request,
    ).toContain("researcher");
    expect(
      coworkerDraftReviseCommandSchema.parse({
        schemaVersion: 1,
        draft_revision: 2,
        draft_hash: HASH,
        revision_request: "Remove write access",
        idempotency_key: "idem_9",
      }).draft_revision,
    ).toBe(2);
    expect(
      coworkerDraftConfirmCommandSchema.safeParse({
        schemaVersion: 1,
        draft_revision: 2,
        draft_hash: HASH,
        policy_revision: 4,
        catalog_revision: 3,
        idempotency_key: "idem_10",
        tool_grants: ["WRITE"],
      }).success,
    ).toBe(false);
    expect(
      coworkerDraftRejectCommandSchema.parse({
        schemaVersion: 1,
        draft_revision: 2,
        draft_hash: HASH,
        reason: "Wrong scope",
        idempotency_key: "idem_11",
      }).reason,
    ).toBe("Wrong scope");
    expect(
      coworkerDisableCommandSchema.parse({
        schemaVersion: 1,
        expected_config_revision: 4,
        reason: "Owner disabled",
        idempotency_key: "idem_12",
      }).expected_config_revision,
    ).toBe(4);

    const update = {
      name: "Analyst",
      handle: "analyst",
      title: "Evidence analyst",
      standing_instructions: "Verify sources and return bounded findings.",
      model_preset: "default",
      native_subagents_enabled: false,
      channel_ids: ["channel_1"],
      budget: { max_turn_tokens: 12_000, max_tool_calls: 20 },
      task_record_grants: [{ channel_id: "channel_1", operations: ["create", "update_status"] }],
      tool_grants: ["PROVIDER_READ_TOOL"],
      skill_version_ids: ["skillv_1"],
      component_version_ids: ["componentv_chart"],
    };
    expect(coworkerUpdateCommandSchema.safeParse(update).success).toBe(true);
    expect(coworkerUpdateCommandSchema.safeParse({ ...update, schemaVersion: 1 }).success).toBe(
      false,
    );
  });

  it("defines safe Task, Run and RunStep commands", () => {
    expect(
      taskCreateCommandSchema.safeParse({
        schemaVersion: 1,
        title: "Inspect fixture",
        description: null,
        status: "todo",
        assignee_type: "coworker",
        assignee_id: null,
        source_message_id: "msg_1",
        source_run_id: null,
        due_at: null,
        idempotency_key: "idem_13",
      }).success,
    ).toBe(false);
    expect(
      taskUpdateCommandSchema.safeParse({
        schemaVersion: 1,
        expected_revision: 1,
        idempotency_key: "idem_14",
      }).success,
    ).toBe(false);
    expect(
      runCancelCommandSchema.parse({
        schemaVersion: 1,
        expected_lifecycle: "active",
        reason: "Owner requested",
        idempotency_key: "idem_15",
      }).expected_lifecycle,
    ).toBe("active");
    expect(
      runSteerCommandSchema.parse({
        schemaVersion: 1,
        instruction: "Continue with the verified source",
        idempotency_key: "idem_16",
      }).instruction,
    ).toContain("verified");
    expect(
      runStepCancelCommandSchema.parse({
        schemaVersion: 1,
        expected_state: "running",
        reason: "Superseded",
        idempotency_key: "idem_17",
      }).expected_state,
    ).toBe("running");
  });

  it("defines closed skill publish/binding and connection commands", () => {
    expect(
      skillDraftCreateCommandSchema.parse({
        schemaVersion: 1,
        source_step_ids: ["step_1"],
        idempotency_key: "idem_18",
      }).source_step_ids,
    ).toEqual(["step_1"]);
    expect(
      skillDraftReviseCommandSchema.safeParse({
        schemaVersion: 1,
        expected_revision: 1,
        expected_draft_hash: HASH,
        idempotency_key: "idem_19",
      }).success,
    ).toBe(false);
    expect(
      skillDraftPublishCommandSchema.parse({
        schemaVersion: 1,
        expected_revision: 1,
        expected_draft_hash: HASH,
        expected_source_content_hash: HASH,
        idempotency_key: "idem_20",
      }).expected_revision,
    ).toBe(1);
    expect(
      skillBindingCreateCommandSchema.parse({
        schemaVersion: 1,
        skill_version_id: "skillv_1",
        expected_manifest_hash: HASH,
        expected_coworker_config_revision: 3,
        idempotency_key: "idem_21",
      }).skill_version_id,
    ).toBe("skillv_1");
    expect(
      skillBindingDeleteCommandSchema.parse({
        schemaVersion: 1,
        expected_state: "active",
        idempotency_key: "idem_22",
      }).expected_state,
    ).toBe("active");
    expect(
      connectionTestCommandSchema.parse({
        schemaVersion: 1,
        expected_connection_id: "connection_1",
        expected_descriptor_hash: HASH,
        idempotency_key: "idem_23",
      }).expected_connection_id,
    ).toBe("connection_1");
    expect(
      connectionReconnectCommandSchema.parse({
        schemaVersion: 1,
        expected_connection_id: "connection_1",
        expected_status: "drifted",
        idempotency_key: "idem_24",
      }).expected_status,
    ).toBe("drifted");
  });

  it("defines strict state-bound payloads for every internal worker command", () => {
    const commands = [
      {
        name: "claim_queue_item",
        payload: {
          queue_item_id: "queue_1",
          expected_state: "queued",
          expected_attempt: 0,
          worker_id: "worker_1",
          lease_expires_at: NOW,
        },
      },
      {
        name: "provision_or_rotate_session",
        payload: {
          channel_id: "channel_1",
          coworker_id: "coworker_1",
          logical_thread_id: "thread_1",
          expected_session_generation: 0,
          requested_session_generation: 1,
          expected_config_revision: 0,
          reason: "provision",
        },
      },
      {
        name: "create_or_reconcile_turn",
        payload: {
          run_id: "run_1",
          run_step_id: "step_1",
          agent_turn_id: "turn_1",
          logical_thread_id: "thread_1",
          expected_turn_state: "intended",
          session_generation_id: "generation_1",
          expected_session_generation: 1,
          application_run_token: "run_token_1",
        },
      },
      {
        name: "ingest_trueforge_event",
        payload: {
          run_id: "run_1",
          run_step_id: "step_1",
          agent_turn_id: "turn_1",
          expected_turn_state: "streaming",
          session_generation_id: "generation_1",
          expected_session_generation: 1,
          upstream_event_id: "upstream_event_1",
          upstream_event_type: "tool.result",
          event_payload: { resultRef: "result_1" },
        },
      },
      {
        name: "validate_and_persist_agui_envelope",
        payload: {
          channel_id: "channel_1",
          expected_channel_sequence: 4,
          expected_channel_revision: null,
          expected_thread_revision: null,
          expected_activity_revision: null,
          envelope: {
            schemaVersion: 1,
            channelId: "channel_1",
            channelSequence: 5,
            applicationRunId: "run_1",
            runStepId: "step_1",
            agentTurnId: "turn_1",
            actorKind: "coworker",
            coworkerId: "coworker_1",
            logicalThreadId: "thread_1",
            aguiEvent: {
              type: "CUSTOM",
              name: "turn.reconnecting",
              payload: { schemaVersion: 1 },
            },
          },
        },
      },
      {
        name: "offer_and_recheck_component_tool",
        payload: {
          channel_id: "channel_1",
          coworker_id: "coworker_1",
          run_step_id: "step_1",
          agent_turn_id: "turn_1",
          expected_session_generation: 1,
          component_version_id: "component_version_1",
          expected_descriptor_hash: HASH,
          expected_grant_scope_hash: HASH,
        },
      },
      {
        name: "finalize_or_quarantine_ui_instance",
        payload: {
          ui_instance_id: "ui_1",
          expected_status: "building",
          expected_render_revision: null,
          next_render_revision: 1,
          render_manifest_hash: HASH,
          outcome: "ready",
        },
      },
      {
        name: "apply_scoped_ui_interaction",
        payload: {
          interaction_id: "interaction_1",
          ui_instance_id: "ui_1",
          expected_interaction_state: "token_issued",
          expected_render_revision: 1,
          expected_state_revision: null,
          action_grant_id: "action_grant_1",
          expected_action_grant_use_count: 0,
          redacted_input_hash: HASH,
        },
      },
      {
        name: "claim_pause_group_resume",
        payload: {
          workspace_id: "ws_1",
          pause_group_id: "pause_1",
          expected_state: "ready",
          expected_generation: 1,
          expected_required_action_count: 2,
          expected_resolved_action_count: 2,
          application_run_token: "run_token_1",
          response_payload_hash: HASH,
          resume_claim_token: "claim_1",
          worker_id: "worker_1",
        },
      },
      {
        name: "publish_sandbox_artifact",
        payload: {
          sandbox_id: "sandbox_1",
          run_id: "run_1",
          run_step_id: "step_1",
          artifact_id: "artifact_1",
          expected_sandbox_state: "command_completed",
          expected_artifact_revision: 0,
          next_artifact_revision: 1,
          content_hash: HASH,
          byte_size: 512,
        },
      },
      {
        name: "reconcile_deterministic_provider_update",
        payload: {
          action_proposal_id: "proposal_1",
          expected_proposal_state: "unknown",
          connector_binding_id: "connector_1",
          account_id: "account_1",
          provider_idempotency_key: "provider_intent_1",
          expected_arguments_hash: HASH,
          expected_target_hash: HASH,
        },
      },
    ];

    for (const [index, command] of commands.entries()) {
      expect(
        internalWorkerCommandSchema.safeParse({
          schemaVersion: 1,
          command_id: `cmd_${index}`,
          ...command,
        }).success,
        command.name,
      ).toBe(true);
      expect(
        internalWorkerCommandSchema.safeParse({
          schemaVersion: 1,
          command_id: `empty_cmd_${index}`,
          name: command.name,
          payload: {},
        }).success,
        `${command.name}: empty payload`,
      ).toBe(false);
    }

    const narrowed = internalWorkerCommandSchema.parse({
      schemaVersion: 1,
      command_id: "typed_cmd",
      ...commands[0],
    });
    if (narrowed.name !== "claim_queue_item") {
      throw new Error("fixture must narrow to claim_queue_item");
    }
    const queueItemId: string = narrowed.payload.queue_item_id;
    expect(queueItemId).toBe("queue_1");
    // @ts-expect-error claim_queue_item payloads cannot expose PauseGroup fields.
    expect(narrowed.payload.pause_group_id).toBeUndefined();

    const channelDeltaCommand = {
      schemaVersion: 1,
      command_id: "channel_delta_cmd",
      name: "validate_and_persist_agui_envelope",
      payload: {
        channel_id: "channel_1",
        expected_channel_sequence: 5,
        expected_channel_revision: 2,
        expected_thread_revision: null,
        expected_activity_revision: null,
        envelope: {
          schemaVersion: 1,
          channelId: "channel_1",
          channelSequence: 6,
          actorKind: "system",
          aguiEvent: {
            type: "STATE_DELTA",
            stateKind: "channel",
            revision: 2,
            patch: [
              { op: "test", path: "/revision", value: 2 },
              { op: "replace", path: "/channel/name", value: "Renamed" },
              { op: "replace", path: "/revision", value: 3 },
            ],
          },
        },
      },
    };
    expect(internalWorkerCommandSchema.safeParse(channelDeltaCommand).success).toBe(true);
    expect(
      internalWorkerCommandSchema.safeParse({
        ...channelDeltaCommand,
        payload: { ...channelDeltaCommand.payload, expected_channel_revision: 1 },
      }).success,
    ).toBe(false);

    const activityDeltaCommand = {
      schemaVersion: 1,
      command_id: "activity_delta_cmd",
      name: "validate_and_persist_agui_envelope",
      payload: {
        channel_id: "channel_1",
        expected_channel_sequence: 6,
        expected_channel_revision: null,
        expected_thread_revision: null,
        expected_activity_revision: 1,
        envelope: {
          schemaVersion: 1,
          channelId: "channel_1",
          channelSequence: 7,
          applicationRunId: "run_1",
          runStepId: "step_1",
          agentTurnId: "turn_1",
          actorKind: "coworker",
          coworkerId: "coworker_1",
          logicalThreadId: "thread_1",
          aguiEvent: {
            type: "ACTIVITY_DELTA",
            messageId: "activity_1",
            activityType: "forgeroom.controlled_ui.v1",
            patch: [
              { op: "test", path: "/activityRevision", value: 1 },
              { op: "replace", path: "/textAlternative", value: "Updated chart" },
              { op: "replace", path: "/activityRevision", value: 2 },
            ],
          },
        },
      },
    };
    expect(internalWorkerCommandSchema.safeParse(activityDeltaCommand).success).toBe(true);
    expect(
      internalWorkerCommandSchema.safeParse({
        ...activityDeltaCommand,
        payload: { ...activityDeltaCommand.payload, expected_activity_revision: 5 },
      }).success,
    ).toBe(false);

    expect(
      internalWorkerCommandSchema.safeParse({
        schemaVersion: 1,
        command_id: "cmd_2",
        name: "not_a_worker_command",
        payload: {},
      }).success,
    ).toBe(false);
  });
});
