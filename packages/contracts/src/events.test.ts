import { describe, expect, it } from "vitest";
import {
  agentChannelEnvelopeSchema,
  activityDeltaEventSchema,
  activitySnapshotEventSchema,
  customApplicationEventSchema,
  jsonPatchOperationSchema,
  stateDeltaEventSchema,
} from "./events";
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
      payload: {
        schemaVersion: 1 as const,
        routing_mode: "direct" as const,
        recipient_handles: ["analyst"],
      },
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

    expect(
      agentChannelEnvelopeSchema.safeParse({
        schemaVersion: 1,
        channelId: "ch_1",
        channelSequence: 4,
        actorKind: "human",
        coworkerId: "cw_1",
        logicalThreadId: "thread_1",
        sourceMessageId: "msg_2",
        aguiEvent: event,
      }).success,
    ).toBe(false);
  });

  it("preserves authoritative PauseGroup and controlled-UI activity invariants", () => {
    for (const content of [
      {
        schemaVersion: 1,
        activityRevision: 0,
        activityType: "forgeroom.pause_group.v1",
        pauseGroupId: "pause_1",
        state: "ready",
        requiredActionCount: 2,
        resolvedActionCount: 1,
      },
      {
        schemaVersion: 1,
        activityRevision: 0,
        activityType: "forgeroom.pause_group.v1",
        pauseGroupId: "pause_1",
        state: "collecting",
        requiredActionCount: 1,
        resolvedActionCount: 2,
      },
      {
        schemaVersion: 1,
        activityRevision: 0,
        activityType: "forgeroom.controlled_ui.v1",
        surfaceId: "ui_1",
        rail: "registry_v1",
        componentName: "BarOrLineChart",
        componentVersion: "1.0.0",
        status: "building",
        renderRevision: 1,
        stateRevision: null,
        textAlternative: "Building chart",
      },
      {
        schemaVersion: 1,
        activityRevision: 0,
        activityType: "forgeroom.controlled_ui.v1",
        surfaceId: "ui_1",
        rail: "registry_v1",
        componentName: "BarOrLineChart",
        componentVersion: "1.0.0",
        status: "ready",
        renderRevision: null,
        stateRevision: null,
        textAlternative: "Chart",
      },
    ] as const) {
      expect(
        activitySnapshotEventSchema.safeParse({
          type: "ACTIVITY_SNAPSHOT",
          messageId: "activity_1",
          activityType: content.activityType,
          replace: true,
          content,
        }).success,
        content.activityType,
      ).toBe(false);
    }
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
    for (const projection of [
      { status: "building", renderRevision: 1, stateRevision: null },
      { status: "building", renderRevision: null, stateRevision: 1 },
      { status: "ready", renderRevision: null, stateRevision: null },
    ]) {
      expect(
        channelUIStateV1Schema.safeParse({
          ...channelState,
          uiInstances: {
            ui_1: {
              rail: "registry_v1",
              componentName: "BarOrLineChart",
              componentVersion: "1.0.0",
              ...projection,
            },
          },
        }).success,
      ).toBe(false);
    }
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
          { op: "test", path: "/status", value: "building" },
          { op: "test", path: "/renderRevision", value: null },
          { op: "test", path: "/stateRevision", value: null },
          { op: "replace", path: "/renderRevision", value: 1 },
          { op: "replace", path: "/status", value: "ready" },
          { op: "replace", path: "/activityRevision", value: 1 },
        ],
      }).patch,
    ).toHaveLength(7);
    expect(HASH.startsWith("sha256:")).toBe(true);
    expect(NOW).toContain("2026");
  });

  it("rejects stale, jumping, unsafe, and identity-changing activity deltas", () => {
    const base = {
      type: "ACTIVITY_DELTA" as const,
      messageId: "act_1",
      activityType: "forgeroom.controlled_ui.v1" as const,
    };
    for (const patch of [
      [
        { op: "test", path: "/activityRevision", value: 2 },
        { op: "replace", path: "/status", value: "ready" },
        { op: "replace", path: "/activityRevision", value: 2 },
      ],
      [
        { op: "test", path: "/activityRevision", value: 2 },
        { op: "replace", path: "/status", value: "ready" },
        { op: "replace", path: "/activityRevision", value: 4 },
      ],
      [
        { op: "test", path: "/activityRevision", value: 2 },
        { op: "replace", path: "/activityType", value: "forgeroom.connection.v1" },
        { op: "replace", path: "/activityRevision", value: 3 },
      ],
      [
        { op: "test", path: "/activityRevision", value: 2 },
        { op: "replace", path: "/status", value: { refresh_token: "secret" } },
        { op: "replace", path: "/activityRevision", value: 3 },
      ],
      [
        { op: "test", path: "/activityRevision", value: 2 },
        { op: "replace", path: "/activityRevision", value: 3 },
        { op: "replace", path: "/activityRevision", value: 3 },
      ],
    ]) {
      expect(activityDeltaEventSchema.safeParse({ ...base, patch }).success).toBe(false);
    }
  });

  it("validates activity patch values against each registered activity schema", () => {
    for (const [activityType, path, value] of [
      ["forgeroom.task_record.v1", "/status", "bogus"],
      ["forgeroom.controlled_ui.v1", "/renderRevision", -9],
      ["forgeroom.pause_group.v1", "/requiredActionCount", 0],
      ["forgeroom.pause_group.v1", "/resolvedActionCount", -1],
    ] as const) {
      expect(
        activityDeltaEventSchema.safeParse({
          type: "ACTIVITY_DELTA",
          messageId: "act_1",
          activityType,
          patch: [
            { op: "test", path: "/activityRevision", value: 0 },
            { op: "replace", path, value },
            { op: "replace", path: "/activityRevision", value: 1 },
          ],
        }).success,
        `${activityType}:${path}`,
      ).toBe(false);
    }
  });

  it("requires invariant-coupled activity fields and validates their final state", () => {
    const controlledUiBase = {
      type: "ACTIVITY_DELTA" as const,
      messageId: "act_ui_1",
      activityType: "forgeroom.controlled_ui.v1" as const,
    };
    const pauseGroupBase = {
      type: "ACTIVITY_DELTA" as const,
      messageId: "act_pause_1",
      activityType: "forgeroom.pause_group.v1" as const,
    };

    expect(
      activityDeltaEventSchema.safeParse({
        ...controlledUiBase,
        patch: [
          { op: "test", path: "/activityRevision", value: 0 },
          { op: "replace", path: "/status", value: "ready" },
          { op: "replace", path: "/activityRevision", value: 1 },
        ],
      }).success,
    ).toBe(false);
    expect(
      activityDeltaEventSchema.safeParse({
        ...controlledUiBase,
        patch: [
          { op: "test", path: "/activityRevision", value: 0 },
          { op: "test", path: "/status", value: "building" },
          { op: "test", path: "/renderRevision", value: null },
          { op: "test", path: "/stateRevision", value: null },
          { op: "replace", path: "/status", value: "ready" },
          { op: "replace", path: "/activityRevision", value: 1 },
        ],
      }).success,
    ).toBe(false);
    expect(
      activityDeltaEventSchema.safeParse({
        ...controlledUiBase,
        patch: [
          { op: "test", path: "/activityRevision", value: 0 },
          { op: "test", path: "/status", value: "ready" },
          { op: "test", path: "/renderRevision", value: null },
          { op: "test", path: "/stateRevision", value: null },
          { op: "replace", path: "/renderRevision", value: 1 },
          { op: "replace", path: "/activityRevision", value: 1 },
        ],
      }).success,
    ).toBe(false);
    expect(
      activityDeltaEventSchema.safeParse({
        ...pauseGroupBase,
        patch: [
          { op: "test", path: "/activityRevision", value: 0 },
          { op: "test", path: "/state", value: "collecting" },
          { op: "test", path: "/requiredActionCount", value: 2 },
          { op: "test", path: "/resolvedActionCount", value: 1 },
          { op: "replace", path: "/state", value: "ready" },
          { op: "replace", path: "/activityRevision", value: 1 },
        ],
      }).success,
    ).toBe(false);

    expect(
      activityDeltaEventSchema.safeParse({
        ...pauseGroupBase,
        patch: [
          { op: "test", path: "/activityRevision", value: 0 },
          { op: "test", path: "/state", value: "collecting" },
          { op: "test", path: "/requiredActionCount", value: 2 },
          { op: "test", path: "/resolvedActionCount", value: 1 },
          { op: "replace", path: "/resolvedActionCount", value: 2 },
          { op: "replace", path: "/state", value: "ready" },
          { op: "replace", path: "/activityRevision", value: 1 },
        ],
      }).success,
    ).toBe(true);
  });
});

describe("RFC 6902 operations", () => {
  it("uses strict operation-specific shapes and safe JSON values", () => {
    expect(
      jsonPatchOperationSchema.safeParse({ op: "add", path: "/title", value: "ok" }).success,
    ).toBe(true);
    expect(jsonPatchOperationSchema.safeParse({ op: "remove", path: "/title" }).success).toBe(true);
    expect(
      jsonPatchOperationSchema.safeParse({ op: "move", from: "/old", path: "/new" }).success,
    ).toBe(true);
    expect(
      jsonPatchOperationSchema.safeParse({
        op: "add",
        path: "/tasks/%5F%5Fproto%5F%5F",
        value: {},
      }).success,
    ).toBe(true);

    for (const operation of [
      { op: "add", path: "/title" },
      { op: "remove", path: "/title", value: "unexpected" },
      { op: "replace", path: "/title" },
      { op: "move", path: "/new" },
      { op: "copy", from: "/old", path: "/new", value: "unexpected" },
      { op: "test", path: "/title", value: { client_secret: "secret" } },
      { op: "add", path: "/bad~2pointer", value: "x" },
      { op: "add", path: "/tasks/__proto__", value: {} },
      { op: "add", path: "/runs/CONSTRUCTOR", value: {} },
    ]) {
      expect(jsonPatchOperationSchema.safeParse(operation).success).toBe(false);
    }
  });
});

describe("state delta policy", () => {
  const channelDelta = {
    type: "STATE_DELTA" as const,
    stateKind: "channel" as const,
    revision: 4,
    patch: [
      { op: "test", path: "/revision", value: 4 },
      { op: "replace", path: "/runs/run_1/lifecycle", value: "active" },
      { op: "replace", path: "/revision", value: 5 },
    ],
  };
  const threadDelta = {
    type: "STATE_DELTA" as const,
    stateKind: "thread" as const,
    revision: 7,
    patch: [
      { op: "test", path: "/revision", value: 7 },
      { op: "replace", path: "/phase", value: "running" },
      { op: "replace", path: "/revision", value: 8 },
    ],
  };

  it("binds the declared base and exact next revision", () => {
    expect(stateDeltaEventSchema.safeParse(channelDelta).success).toBe(true);
    expect(stateDeltaEventSchema.safeParse(threadDelta).success).toBe(true);
    expect(
      stateDeltaEventSchema.safeParse({
        ...channelDelta,
        patch: [
          { op: "test", path: "/revision", value: 3 },
          { op: "replace", path: "/channel/name", value: "Renamed" },
          { op: "replace", path: "/revision", value: 4 },
        ],
      }).success,
    ).toBe(false);
    expect(
      stateDeltaEventSchema.safeParse({
        ...channelDelta,
        patch: [
          { op: "test", path: "/revision", value: 4 },
          { op: "replace", path: "/channel/name", value: "Renamed" },
          { op: "replace", path: "/revision", value: 6 },
        ],
      }).success,
    ).toBe(false);
  });

  it("preserves required fields and validates replacement values", () => {
    for (const [stateKind, path, operation] of [
      ["channel", "/channel/name", { op: "remove", path: "/channel/name" }],
      ["thread", "/phase", { op: "remove", path: "/phase" }],
      ["channel", "/channel/archived", { op: "replace", path: "/channel/archived", value: "yes" }],
    ] as const) {
      expect(
        stateDeltaEventSchema.safeParse({
          type: "STATE_DELTA",
          stateKind,
          revision: 1,
          patch: [
            { op: "test", path: "/revision", value: 1 },
            operation,
            { op: "replace", path: "/revision", value: 2 },
          ],
        }).success,
        `${stateKind}:${path}`,
      ).toBe(false);
    }
  });

  it("allows removal only for optional state fields and collection entries", () => {
    for (const [stateKind, path] of [
      ["channel", "/coworkers/cw_1/currentAssignment"],
      ["channel", "/tasks/task_1/assigneeId"],
      ["thread", "/activeAguiRunId"],
    ] as const) {
      expect(
        stateDeltaEventSchema.safeParse({
          type: "STATE_DELTA",
          stateKind,
          revision: 1,
          patch: [
            { op: "test", path: "/revision", value: 1 },
            { op: "remove", path },
            { op: "replace", path: "/revision", value: 2 },
          ],
        }).success,
        `${stateKind}:${path}`,
      ).toBe(true);
    }
  });

  it("requires coupled UI projection preconditions and validates the final projection", () => {
    const base = {
      type: "STATE_DELTA" as const,
      stateKind: "channel" as const,
      revision: 1,
    };

    for (const patch of [
      [
        { op: "test", path: "/revision", value: 1 },
        { op: "replace", path: "/uiInstances/ui_1/status", value: "ready" },
        { op: "replace", path: "/revision", value: 2 },
      ],
      [
        { op: "test", path: "/revision", value: 1 },
        { op: "test", path: "/uiInstances/ui_1/status", value: "building" },
        { op: "test", path: "/uiInstances/ui_1/renderRevision", value: null },
        { op: "test", path: "/uiInstances/ui_1/stateRevision", value: null },
        { op: "replace", path: "/uiInstances/ui_1/status", value: "ready" },
        { op: "replace", path: "/revision", value: 2 },
      ],
    ] as const) {
      expect(stateDeltaEventSchema.safeParse({ ...base, patch }).success).toBe(false);
    }

    expect(
      stateDeltaEventSchema.safeParse({
        ...base,
        patch: [
          { op: "test", path: "/revision", value: 1 },
          { op: "test", path: "/uiInstances/ui_1/status", value: "building" },
          { op: "test", path: "/uiInstances/ui_1/renderRevision", value: null },
          { op: "test", path: "/uiInstances/ui_1/stateRevision", value: null },
          { op: "replace", path: "/uiInstances/ui_1/renderRevision", value: 1 },
          { op: "replace", path: "/uiInstances/ui_1/status", value: "ready" },
          { op: "replace", path: "/revision", value: 2 },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects prototype-mutating record paths and snapshot keys before reconstruction", () => {
    for (const path of ["/tasks/__proto__", "/runs/constructor", "/coworkers/Prototype"]) {
      expect(
        stateDeltaEventSchema.safeParse({
          type: "STATE_DELTA",
          stateKind: "channel",
          revision: 1,
          patch: [
            { op: "test", path: "/revision", value: 1 },
            { op: "add", path, value: {} },
            { op: "replace", path: "/revision", value: 2 },
          ],
        }).success,
        path,
      ).toBe(false);
    }

    const snapshotWithUnsafeTaskKey = JSON.parse(`{
      "schemaVersion": 1,
      "stateKind": "channel",
      "revision": 1,
      "channel": { "id": "ch_1", "name": "Demo", "archived": false },
      "coworkers": {},
      "runs": {},
      "artifacts": {},
      "tasks": {
        "__proto__": { "revision": 1, "status": "todo", "title": "unsafe" }
      },
      "uiInstances": {},
      "pendingHumanActions": []
    }`) as unknown;
    expect(channelUIStateV1Schema.safeParse(snapshotWithUnsafeTaskKey).success).toBe(false);

    const literalPercentId = "%5F%5Fproto%5F%5F";
    expect(
      stateDeltaEventSchema.safeParse({
        type: "STATE_DELTA",
        stateKind: "channel",
        revision: 1,
        patch: [
          { op: "test", path: "/revision", value: 1 },
          {
            op: "add",
            path: `/tasks/${literalPercentId}`,
            value: { revision: 1, status: "todo", title: "Literal percent ID" },
          },
          { op: "replace", path: "/revision", value: 2 },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects identity, discriminator, cross-lane, and authority-sensitive paths", () => {
    for (const [stateKind, path] of [
      ["channel", "/schemaVersion"],
      ["channel", "/stateKind"],
      ["channel", "/channel/id"],
      ["channel", "/grants/grant_1"],
      ["channel", "/approvalDecisions/ap_1"],
      ["channel", "/accounts/account_1"],
      ["thread", "/coworkerId"],
      ["thread", "/logicalThreadId"],
      ["thread", "/runs/run_1/lifecycle"],
    ] as const) {
      expect(
        stateDeltaEventSchema.safeParse({
          type: "STATE_DELTA",
          stateKind,
          revision: 1,
          patch: [
            { op: "test", path: "/revision", value: 1 },
            { op: "replace", path, value: "forged" },
            { op: "replace", path: "/revision", value: 2 },
          ],
        }).success,
        `${stateKind}:${path}`,
      ).toBe(false);
    }
  });

  it("enforces system channel and matching coworker thread authority lanes", () => {
    const systemBase = {
      schemaVersion: 1 as const,
      channelId: "ch_1",
      channelSequence: 10,
      actorKind: "system" as const,
    };
    const coworkerBase = {
      schemaVersion: 1 as const,
      channelId: "ch_1",
      channelSequence: 11,
      applicationRunId: "run_1",
      runStepId: "step_1",
      agentTurnId: "turn_1",
      actorKind: "coworker" as const,
      coworkerId: "cw_1",
      logicalThreadId: "thread_1",
    };
    const channelState = channelUIStateV1Schema.parse({
      schemaVersion: 1,
      stateKind: "channel",
      revision: 4,
      channel: { id: "ch_1", name: "Demo", archived: false },
      coworkers: {},
      runs: {},
      artifacts: {},
      tasks: {},
      uiInstances: {},
      pendingHumanActions: [],
    });
    const threadState = threadUIStateV1Schema.parse({
      schemaVersion: 1,
      stateKind: "thread",
      revision: 7,
      coworkerId: "cw_1",
      logicalThreadId: "thread_1",
      phase: "running",
      activeRunStepIds: ["step_1"],
      surfaceIds: [],
    });

    expect(
      agentChannelEnvelopeSchema.safeParse({ ...systemBase, aguiEvent: channelDelta }).success,
    ).toBe(true);
    expect(
      agentChannelEnvelopeSchema.safeParse({ ...coworkerBase, aguiEvent: threadDelta }).success,
    ).toBe(true);
    expect(
      agentChannelEnvelopeSchema.safeParse({
        ...systemBase,
        actorKind: "human",
        aguiEvent: channelDelta,
      }).success,
    ).toBe(false);
    expect(
      agentChannelEnvelopeSchema.safeParse({ ...coworkerBase, aguiEvent: channelDelta }).success,
    ).toBe(false);
    expect(
      agentChannelEnvelopeSchema.safeParse({ ...systemBase, aguiEvent: threadDelta }).success,
    ).toBe(false);
    expect(
      agentChannelEnvelopeSchema.safeParse({
        ...coworkerBase,
        aguiEvent: { type: "STATE_SNAPSHOT", snapshot: threadState },
      }).success,
    ).toBe(true);
    expect(
      agentChannelEnvelopeSchema.safeParse({
        ...coworkerBase,
        logicalThreadId: "thread_other",
        aguiEvent: { type: "STATE_SNAPSHOT", snapshot: threadState },
      }).success,
    ).toBe(false);
    expect(
      agentChannelEnvelopeSchema.safeParse({
        ...systemBase,
        channelId: "ch_other",
        aguiEvent: { type: "STATE_SNAPSHOT", snapshot: channelState },
      }).success,
    ).toBe(false);
  });
});

describe("custom application events", () => {
  it("rejects unknown payload fields", () => {
    expect(
      customApplicationEventSchema.safeParse({
        type: "CUSTOM",
        name: "message.created",
        payload: { schemaVersion: 1, raw: "unexpected" },
      }).success,
    ).toBe(false);
  });

  it("requires routing fields on message.created", () => {
    expect(
      customApplicationEventSchema.safeParse({
        type: "CUSTOM",
        name: "message.created",
        payload: { schemaVersion: 1 },
      }).success,
    ).toBe(false);
    expect(
      customApplicationEventSchema.safeParse({
        type: "CUSTOM",
        name: "message.created",
        payload: {
          schemaVersion: 1,
          routing_mode: "team",
          recipient_handles: ["analyst", "builder"],
        },
      }).success,
    ).toBe(true);
  });
});
