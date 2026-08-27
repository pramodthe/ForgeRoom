import { describe, expect, it } from "vitest";
import { toPersistedAgUiEvent } from "./persisted";

describe("toPersistedAgUiEvent", () => {
  it("keeps safe text while dropping provider metadata", () => {
    expect(
      toPersistedAgUiEvent({
        type: "TEXT_MESSAGE_CONTENT",
        messageId: "message_1",
        delta: "Safe answer",
        metadata: { provider_token: "secret" },
        rawEvent: { api_key: "secret" },
      }),
    ).toEqual({
      type: "TEXT_MESSAGE_CONTENT",
      messageId: "message_1",
      delta: "Safe answer",
    });
  });

  it("strips interrupt metadata and response schemas", () => {
    expect(
      toPersistedAgUiEvent({
        type: "RUN_FINISHED",
        threadId: "thread_1",
        runId: "run_1",
        outcome: {
          type: "interrupt",
          interrupts: [
            {
              id: "interrupt_1",
              reason: "approval_required",
              message: "Approval is required.",
              metadata: { account_id: "hidden" },
              responseSchema: { type: "object" },
            },
          ],
        },
        metadata: { provider: "hidden" },
      }),
    ).toEqual({
      type: "RUN_FINISHED",
      threadId: "thread_1",
      runId: "run_1",
      outcome: {
        type: "interrupt",
        interrupts: [
          {
            id: "interrupt_1",
            reason: "approval_required",
            message: "Approval is required.",
          },
        ],
      },
    });
  });

  it("does not persist unsupported or malformed events", () => {
    expect(toPersistedAgUiEvent({ type: "RAW", event: { secret: true } })).toBeNull();
    expect(toPersistedAgUiEvent({ type: "TEXT_MESSAGE_START", role: "assistant" })).toBeNull();
  });

  it("projects STATE_SNAPSHOT and STATE_DELTA while dropping extras", () => {
    const channelSnapshot = {
      schemaVersion: 1 as const,
      stateKind: "channel" as const,
      revision: 1,
      channel: { id: "ch_1", name: "Demo", archived: false },
      coworkers: {},
      runs: {},
      artifacts: {},
      tasks: {},
      uiInstances: {},
      pendingHumanActions: [],
    };
    expect(
      toPersistedAgUiEvent({
        type: "STATE_SNAPSHOT",
        snapshot: channelSnapshot,
        metadata: { provider: "hidden" },
      }),
    ).toEqual({
      type: "STATE_SNAPSHOT",
      snapshot: channelSnapshot,
    });

    expect(
      toPersistedAgUiEvent({
        type: "STATE_DELTA",
        stateKind: "thread",
        revision: 2,
        patch: [
          { op: "test", path: "/revision", value: 2 },
          { op: "replace", path: "/phase", value: "running" },
          { op: "replace", path: "/revision", value: 3 },
        ],
        rawEvent: { secret: true },
      }),
    ).toEqual({
      type: "STATE_DELTA",
      stateKind: "thread",
      revision: 2,
      patch: [
        { op: "test", path: "/revision", value: 2 },
        { op: "replace", path: "/phase", value: "running" },
        { op: "replace", path: "/revision", value: 3 },
      ],
    });

    expect(
      toPersistedAgUiEvent({
        type: "STATE_DELTA",
        delta: [{ op: "replace", path: "/phase", value: "interrupted" }],
        metadata: {
          forgeroom: {
            schemaVersion: 1,
            channelId: "channel_demo",
            coworkerId: "coworker_operator",
            actorKind: "coworker",
            revision: 1,
          },
        },
      }),
    ).toEqual({
      type: "STATE_DELTA",
      stateKind: "thread",
      revision: 1,
      patch: [
        { op: "test", path: "/revision", value: 1 },
        { op: "replace", path: "/phase", value: "interrupted" },
        { op: "replace", path: "/revision", value: 2 },
      ],
    });

    expect(
      toPersistedAgUiEvent({
        type: "STATE_DELTA",
        delta: [{ op: "replace", path: "/phase", value: "interrupted" }, "not-an-op"],
        metadata: {
          forgeroom: {
            schemaVersion: 1,
            channelId: "channel_demo",
            coworkerId: "coworker_operator",
            actorKind: "coworker",
            revision: 1,
          },
        },
      }),
    ).toBeNull();

    expect(
      toPersistedAgUiEvent({
        type: "STATE_DELTA",
        delta: [{ op: "replace", path: "/phase", value: "interrupted" }],
        metadata: {
          forgeroom: {
            schemaVersion: 1,
            channelId: "channel_demo",
            coworkerId: "coworker_operator",
            actorKind: "coworker",
          },
        },
      }),
    ).toBeNull();

    expect(
      toPersistedAgUiEvent({
        type: "STATE_DELTA",
        stateKind: "channel",
        revision: 1,
        patch: [{ op: "replace", path: "/channel/name", value: "Nope" }],
      }),
    ).toBeNull();
  });
});
