import { describe, expect, it } from "vitest";
import type { AgentChannelEnvelope, ChannelUIStateV1, ThreadUIStateV1 } from "@forgeroom/contracts";
import { initialUiPresentationState, reduceUiPresentationState } from "./ui-state-reducer";

const emptyCounters = {
  planning: 0,
  running: 0,
  awaiting_input: 0,
  awaiting_approval: 0,
  blocked_connection: 0,
  cancelling: 0,
  queued: 0,
};

function channelState(revision: number, name = "Demo"): ChannelUIStateV1 {
  return {
    schemaVersion: 1,
    stateKind: "channel",
    revision,
    channel: { id: "ch_1", name, archived: false },
    coworkers: {},
    runs: {
      run_1: { lifecycle: "active", counters: emptyCounters },
    },
    artifacts: {},
    tasks: {},
    uiInstances: {},
    pendingHumanActions: [],
  };
}

function threadState(revision: number, phase: ThreadUIStateV1["phase"] = "idle"): ThreadUIStateV1 {
  return {
    schemaVersion: 1,
    stateKind: "thread",
    revision,
    coworkerId: "cw_1",
    logicalThreadId: "thread_1",
    phase,
    activeRunStepIds: ["step_1"],
    surfaceIds: [],
  };
}

function systemEnvelope(
  sequence: number,
  aguiEvent: AgentChannelEnvelope["aguiEvent"],
): AgentChannelEnvelope {
  return {
    schemaVersion: 1,
    channelId: "ch_1",
    channelSequence: sequence,
    actorKind: "system",
    aguiEvent,
  };
}

function coworkerEnvelope(
  sequence: number,
  aguiEvent: AgentChannelEnvelope["aguiEvent"],
): AgentChannelEnvelope {
  return {
    schemaVersion: 1,
    channelId: "ch_1",
    channelSequence: sequence,
    actorKind: "coworker",
    coworkerId: "cw_1",
    logicalThreadId: "thread_1",
    applicationRunId: "app_run_1",
    runStepId: "step_1",
    agentTurnId: "turn_1",
    aguiEvent,
  };
}

describe("reduceUiPresentationState", () => {
  it("lets only the system lane own ChannelUIState", () => {
    const afterSystem = reduceUiPresentationState(
      initialUiPresentationState(),
      systemEnvelope(1, { type: "STATE_SNAPSHOT", snapshot: channelState(1) }),
    );
    expect(afterSystem.channel?.revision).toBe(1);
    expect(afterSystem.needChannelSnapshot).toBe(false);

    const raced = reduceUiPresentationState(
      afterSystem,
      coworkerEnvelope(2, { type: "STATE_SNAPSHOT", snapshot: channelState(9, "Hijacked") }),
    );
    expect(raced.channel?.channel.name).toBe("Demo");
    expect(raced.needChannelSnapshot).toBe(true);
  });

  it("keeps ThreadUIState on the coworker lane and rejects system thread ownership", () => {
    let state = reduceUiPresentationState(
      initialUiPresentationState(),
      systemEnvelope(1, { type: "STATE_SNAPSHOT", snapshot: channelState(1) }),
    );
    state = reduceUiPresentationState(
      state,
      coworkerEnvelope(2, { type: "STATE_SNAPSHOT", snapshot: threadState(1, "running") }),
    );
    expect(state.threads.thread_1?.phase).toBe("running");
    expect(state.channel?.revision).toBe(1);

    state = reduceUiPresentationState(
      state,
      systemEnvelope(3, { type: "STATE_SNAPSHOT", snapshot: threadState(2, "failed") }),
    );
    expect(state.threads.thread_1?.phase).toBe("running");
    expect(state.needThreadSnapshots.thread_1).toBe(true);
  });

  it("replaces on STATE_SNAPSHOT and applies revisioned STATE_DELTA", () => {
    let state = reduceUiPresentationState(
      initialUiPresentationState(),
      systemEnvelope(1, { type: "STATE_SNAPSHOT", snapshot: channelState(4) }),
    );
    state = reduceUiPresentationState(
      state,
      systemEnvelope(2, {
        type: "STATE_DELTA",
        stateKind: "channel",
        revision: 4,
        patch: [
          { op: "test", path: "/revision", value: 4 },
          { op: "replace", path: "/channel/name", value: "Renamed" },
          { op: "replace", path: "/revision", value: 5 },
        ],
      }),
    );
    expect(state.channel).toMatchObject({ revision: 5, channel: { name: "Renamed" } });
    expect(state.needChannelSnapshot).toBe(false);

    state = reduceUiPresentationState(
      state,
      coworkerEnvelope(3, { type: "STATE_SNAPSHOT", snapshot: threadState(7, "queued") }),
    );
    state = reduceUiPresentationState(
      state,
      coworkerEnvelope(4, {
        type: "STATE_DELTA",
        stateKind: "thread",
        revision: 7,
        patch: [
          { op: "test", path: "/revision", value: 7 },
          { op: "replace", path: "/phase", value: "running" },
          { op: "replace", path: "/revision", value: 8 },
        ],
      }),
    );
    expect(state.threads.thread_1).toMatchObject({ revision: 8, phase: "running" });
  });

  it("requests a fresh snapshot on wrong base or unsafe delta instead of guessing", () => {
    let state = reduceUiPresentationState(
      initialUiPresentationState(),
      systemEnvelope(1, { type: "STATE_SNAPSHOT", snapshot: channelState(4) }),
    );
    state = reduceUiPresentationState(
      state,
      systemEnvelope(2, {
        type: "STATE_DELTA",
        stateKind: "channel",
        revision: 3,
        patch: [
          { op: "test", path: "/revision", value: 3 },
          { op: "replace", path: "/channel/name", value: "Stale" },
          { op: "replace", path: "/revision", value: 4 },
        ],
      }),
    );
    expect(state.channel?.revision).toBe(4);
    expect(state.channel?.channel.name).toBe("Demo");
    expect(state.needChannelSnapshot).toBe(true);

    // Once resync is required, later matching deltas must not clear the latch.
    state = reduceUiPresentationState(
      state,
      systemEnvelope(3, {
        type: "STATE_DELTA",
        stateKind: "channel",
        revision: 4,
        patch: [
          { op: "test", path: "/revision", value: 4 },
          { op: "replace", path: "/channel/name", value: "ShouldNotApply" },
          { op: "replace", path: "/revision", value: 5 },
        ],
      }),
    );
    expect(state.channel?.revision).toBe(4);
    expect(state.channel?.channel.name).toBe("Demo");
    expect(state.needChannelSnapshot).toBe(true);

    state = reduceUiPresentationState(
      {
        ...state,
        needChannelSnapshot: false,
      },
      systemEnvelope(4, {
        type: "STATE_DELTA",
        stateKind: "channel",
        revision: 4,
        patch: [
          { op: "test", path: "/revision", value: 4 },
          { op: "replace", path: "/channel/id", value: "ch_other" },
          { op: "replace", path: "/revision", value: 5 },
        ],
      }),
    );
    expect(state.channel?.channel.id).toBe("ch_1");
    expect(state.needChannelSnapshot).toBe(true);

    state = reduceUiPresentationState(
      initialUiPresentationState(),
      coworkerEnvelope(1, { type: "STATE_SNAPSHOT", snapshot: threadState(1) }),
    );
    state = reduceUiPresentationState(
      state,
      coworkerEnvelope(2, {
        type: "STATE_DELTA",
        stateKind: "thread",
        revision: 1,
        patch: [
          { op: "test", path: "/revision", value: 1 },
          { op: "replace", path: "/coworkerId", value: "cw_other" },
          { op: "replace", path: "/revision", value: 2 },
        ],
      }),
    );
    expect(state.threads.thread_1?.coworkerId).toBe("cw_1");
    expect(state.needThreadSnapshots.thread_1).toBe(true);

    state = reduceUiPresentationState(
      state,
      coworkerEnvelope(3, {
        type: "STATE_DELTA",
        stateKind: "thread",
        revision: 1,
        patch: [
          { op: "test", path: "/revision", value: 1 },
          { op: "replace", path: "/phase", value: "running" },
          { op: "replace", path: "/revision", value: 2 },
        ],
      }),
    );
    expect(state.threads.thread_1?.phase).toBe("idle");
    expect(state.needThreadSnapshots.thread_1).toBe(true);
  });

  it("requests a snapshot when no prior state exists for a delta", () => {
    const state = reduceUiPresentationState(
      initialUiPresentationState(),
      systemEnvelope(1, {
        type: "STATE_DELTA",
        stateKind: "channel",
        revision: 0,
        patch: [
          { op: "test", path: "/revision", value: 0 },
          { op: "replace", path: "/channel/name", value: "Guess" },
          { op: "replace", path: "/revision", value: 1 },
        ],
      }),
    );
    expect(state.channel).toBeNull();
    expect(state.needChannelSnapshot).toBe(true);
  });
});
