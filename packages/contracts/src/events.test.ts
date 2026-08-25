import { describe, expect, it } from "vitest";
import { agentChannelEnvelopeSchema, activityDeltaEventSchema } from "./events";
import { channelUIStateV1Schema, threadUIStateV1Schema } from "./state";
import { runSchema } from "./runs";
import { HASH, NOW } from "./test-helpers";

const emptyCounters = {
  planning: 0,
  running: 0,
  awaiting_input: 0,
  awaiting_approval: 0,
  blocked_connection: 0,
  cancelling: 0,
  queued: 0,
};

describe("run lifecycle vs activity counters", () => {
  it("keeps lifecycle distinct from concurrent activity counters", () => {
    const run = runSchema.parse({
      schemaVersion: 1,
      id: "run_1",
      channel_id: "ch_1",
      source_message_id: "msg_1",
      requested_by: "user_1",
      routing_mode: "direct",
      goal: "Inspect the fixture",
      lifecycle: "active",
      activity: { ...emptyCounters, running: 1, awaiting_approval: 1 },
      steps: [
        {
          schemaVersion: 1,
          id: "step_1",
          run_id: "run_1",
          assigned_coworker_id: "cw_1",
          logical_thread_id: "thread_1",
          objective: "Read",
          state: "awaiting_approval",
          attempt: 1,
        },
      ],
      started_at: NOW,
      completed_at: null,
    });
    expect(run.lifecycle).toBe("active");
    expect(run.activity.running).toBe(1);
    expect(run.activity.awaiting_approval).toBe(1);
    expect(
      runSchema.safeParse({
        ...run,
        lifecycle: "awaiting_approval",
      }).success,
    ).toBe(false);
  });
});

describe("channel envelope", () => {
  it("requires coworker correlation and rejects native subagent actors", () => {
    const event = {
      type: "CUSTOM" as const,
      name: "message.created" as const,
      payload: { schemaVersion: 1 as const },
    };
    expect(
      agentChannelEnvelopeSchema.safeParse({
        schemaVersion: 1,
        channelId: "ch_1",
        channelSequence: 3,
        actorKind: "coworker",
        aguiEvent: event,
      }).success,
    ).toBe(false);

    const coworker = agentChannelEnvelopeSchema.parse({
      schemaVersion: 1,
      channelId: "ch_1",
      channelSequence: 3,
      applicationRunId: "run_1",
      runStepId: "step_1",
      agentTurnId: "turn_1",
      actorKind: "coworker",
      coworkerId: "cw_1",
      logicalThreadId: "thread_1",
      sourceMessageId: "msg_1",
      aguiEvent: event,
    });
    expect(coworker.logicalThreadId).toBe("thread_1");
    expect("nativeSubagentId" in coworker ? coworker.nativeSubagentId : undefined).toBeUndefined();

    expect(
      agentChannelEnvelopeSchema.safeParse({
        ...coworker,
        actorKind: "native_subagent",
        nativeSubagentId: "child_1",
      }).success,
    ).toBe(false);
  });

  it("keeps channel system state distinct from thread-local state", () => {
    const channelState = channelUIStateV1Schema.parse({
      schemaVersion: 1,
      stateKind: "channel",
      revision: 4,
      channel: { id: "ch_1", name: "Demo", archived: false },
      coworkers: {},
      runs: {
        run_1: { lifecycle: "active", counters: emptyCounters },
      },
      artifacts: {},
      tasks: {},
      uiInstances: {},
      pendingHumanActions: [],
    });
    const threadState = threadUIStateV1Schema.parse({
      schemaVersion: 1,
      stateKind: "thread",
      revision: 2,
      coworkerId: "cw_1",
      logicalThreadId: "thread_1",
      phase: "running",
      activeRunStepIds: ["step_1"],
      surfaceIds: [],
    });
    expect(channelState.stateKind).not.toBe(threadState.stateKind);
    expect(
      agentChannelEnvelopeSchema.parse({
        schemaVersion: 1,
        channelId: "ch_1",
        channelSequence: 8,
        actorKind: "system",
        aguiEvent: { type: "STATE_SNAPSHOT", snapshot: channelState },
      }).coworkerId,
    ).toBeUndefined();
    expect(
      agentChannelEnvelopeSchema.safeParse({
        schemaVersion: 1,
        channelId: "ch_1",
        channelSequence: 9,
        actorKind: "system",
        coworkerId: "cw_1",
        logicalThreadId: "thread_1",
        aguiEvent: { type: "STATE_SNAPSHOT", snapshot: channelState },
      }).success,
    ).toBe(false);
  });

  it("requires activity deltas to test then increment activityRevision", () => {
    expect(
      activityDeltaEventSchema.safeParse({
        type: "ACTIVITY_DELTA",
        messageId: "act_1",
        activityType: "forgeroom.controlled_ui.v1",
        patch: [{ op: "replace", path: "/status", value: "ready" }],
      }).success,
    ).toBe(false);
    expect(
      activityDeltaEventSchema.parse({
        type: "ACTIVITY_DELTA",
        messageId: "act_1",
        activityType: "forgeroom.controlled_ui.v1",
        patch: [
          { op: "test", path: "/activityRevision", value: 0 },
          { op: "replace", path: "/status", value: "ready" },
          { op: "replace", path: "/activityRevision", value: 1 },
        ],
      }).patch,
    ).toHaveLength(3);
    expect(HASH.startsWith("sha256:")).toBe(true);
    expect(NOW).toContain("2026");
  });
});
