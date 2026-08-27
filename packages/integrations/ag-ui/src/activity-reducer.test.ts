import { describe, expect, it } from "vitest";
import type { AgentChannelEnvelope, ForgeRoomActivityContent } from "@forgeroom/contracts";
import {
  initialActivityPresentationState,
  reduceActivityPresentationState,
} from "./activity-reducer";

function coworkerWork(
  revision: number,
  phase: "queued" | "running" | "interrupted" | "finished" | "failed" = "running",
): ForgeRoomActivityContent {
  return {
    schemaVersion: 1,
    activityRevision: revision,
    activityType: "forgeroom.coworker_work.v1",
    coworkerId: "cw_1",
    logicalThreadId: "thread_1",
    assignment: "Inspect issues",
    phase,
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

describe("reduceActivityPresentationState", () => {
  it("replaces on ACTIVITY_SNAPSHOT and applies revisioned ACTIVITY_DELTA", () => {
    let state = reduceActivityPresentationState(
      initialActivityPresentationState(),
      coworkerEnvelope(1, {
        type: "ACTIVITY_SNAPSHOT",
        messageId: "act_1",
        activityType: "forgeroom.coworker_work.v1",
        replace: true,
        content: coworkerWork(0),
      }),
    );
    expect(state.activities.act_1?.activityRevision).toBe(0);

    state = reduceActivityPresentationState(
      state,
      coworkerEnvelope(2, {
        type: "ACTIVITY_DELTA",
        messageId: "act_1",
        activityType: "forgeroom.coworker_work.v1",
        patch: [
          { op: "test", path: "/activityRevision", value: 0 },
          { op: "replace", path: "/phase", value: "interrupted" },
          { op: "replace", path: "/activityRevision", value: 1 },
        ],
      }),
    );
    expect(state.activities.act_1).toMatchObject({
      activityRevision: 1,
      phase: "interrupted",
    });
    expect(state.needActivitySnapshots.act_1).toBeUndefined();
  });

  it("requests a fresh snapshot on wrong base and latches until snapshot", () => {
    let state = reduceActivityPresentationState(
      initialActivityPresentationState(),
      coworkerEnvelope(1, {
        type: "ACTIVITY_SNAPSHOT",
        messageId: "act_1",
        activityType: "forgeroom.coworker_work.v1",
        replace: true,
        content: coworkerWork(2),
      }),
    );

    state = reduceActivityPresentationState(
      state,
      coworkerEnvelope(2, {
        type: "ACTIVITY_DELTA",
        messageId: "act_1",
        activityType: "forgeroom.coworker_work.v1",
        patch: [
          { op: "test", path: "/activityRevision", value: 1 },
          { op: "replace", path: "/phase", value: "failed" },
          { op: "replace", path: "/activityRevision", value: 2 },
        ],
      }),
    );
    expect(state.activities.act_1?.phase).toBe("running");
    expect(state.needActivitySnapshots.act_1).toBe(true);

    state = reduceActivityPresentationState(
      state,
      coworkerEnvelope(3, {
        type: "ACTIVITY_DELTA",
        messageId: "act_1",
        activityType: "forgeroom.coworker_work.v1",
        patch: [
          { op: "test", path: "/activityRevision", value: 2 },
          { op: "replace", path: "/phase", value: "finished" },
          { op: "replace", path: "/activityRevision", value: 3 },
        ],
      }),
    );
    expect(state.activities.act_1?.phase).toBe("running");
    expect(state.needActivitySnapshots.act_1).toBe(true);

    state = reduceActivityPresentationState(
      state,
      coworkerEnvelope(4, {
        type: "ACTIVITY_SNAPSHOT",
        messageId: "act_1",
        activityType: "forgeroom.coworker_work.v1",
        replace: true,
        content: coworkerWork(4, "finished"),
      }),
    );
    expect(state.activities.act_1).toMatchObject({ activityRevision: 4, phase: "finished" });
    expect(state.needActivitySnapshots.act_1).toBeUndefined();
  });

  it("rejects identity-changing or forbidden-path deltas", () => {
    let state = reduceActivityPresentationState(
      initialActivityPresentationState(),
      coworkerEnvelope(1, {
        type: "ACTIVITY_SNAPSHOT",
        messageId: "act_1",
        activityType: "forgeroom.coworker_work.v1",
        replace: true,
        content: coworkerWork(0),
      }),
    );

    state = reduceActivityPresentationState(
      state,
      coworkerEnvelope(2, {
        type: "ACTIVITY_DELTA",
        messageId: "act_1",
        activityType: "forgeroom.coworker_work.v1",
        patch: [
          { op: "test", path: "/activityRevision", value: 0 },
          { op: "replace", path: "/activityType", value: "forgeroom.connection.v1" },
          { op: "replace", path: "/activityRevision", value: 1 },
        ],
      }),
    );
    expect(state.activities.act_1?.activityType).toBe("forgeroom.coworker_work.v1");
    expect(state.needActivitySnapshots.act_1).toBe(true);
  });

  it("rejects cross-lane overwrites and stale snapshots", () => {
    let state = reduceActivityPresentationState(
      initialActivityPresentationState(),
      coworkerEnvelope(1, {
        type: "ACTIVITY_SNAPSHOT",
        messageId: "act_1",
        activityType: "forgeroom.coworker_work.v1",
        replace: true,
        content: coworkerWork(2),
      }),
    );

    const otherLane: AgentChannelEnvelope = {
      ...coworkerEnvelope(2, {
        type: "ACTIVITY_SNAPSHOT",
        messageId: "act_1",
        activityType: "forgeroom.coworker_work.v1",
        replace: true,
        content: {
          ...coworkerWork(9, "failed"),
          coworkerId: "cw_other",
          logicalThreadId: "thread_other",
        },
      }),
      coworkerId: "cw_other",
      logicalThreadId: "thread_other",
    };
    state = reduceActivityPresentationState(state, otherLane);
    expect(state.activities.act_1).toMatchObject({
      coworkerId: "cw_1",
      activityRevision: 2,
      phase: "running",
    });
    expect(state.needActivitySnapshots.act_1).toBe(true);

    state = {
      ...state,
      needActivitySnapshots: {},
    };
    state = reduceActivityPresentationState(
      state,
      coworkerEnvelope(3, {
        type: "ACTIVITY_SNAPSHOT",
        messageId: "act_1",
        activityType: "forgeroom.coworker_work.v1",
        replace: true,
        content: coworkerWork(1, "finished"),
      }),
    );
    expect(state.activities.act_1?.activityRevision).toBe(2);
    expect(state.needActivitySnapshots.act_1).toBe(true);
  });

  it("requests a snapshot when no prior activity exists for a delta", () => {
    const state = reduceActivityPresentationState(
      initialActivityPresentationState(),
      coworkerEnvelope(1, {
        type: "ACTIVITY_DELTA",
        messageId: "act_missing",
        activityType: "forgeroom.coworker_work.v1",
        patch: [
          { op: "test", path: "/activityRevision", value: 0 },
          { op: "replace", path: "/phase", value: "running" },
          { op: "replace", path: "/activityRevision", value: 1 },
        ],
      }),
    );
    expect(state.activities.act_missing).toBeUndefined();
    expect(state.needActivitySnapshots.act_missing).toBe(true);
  });
});
