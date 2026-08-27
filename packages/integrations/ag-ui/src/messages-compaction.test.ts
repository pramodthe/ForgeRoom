import type { AgentChannelEnvelope } from "@forgeroom/contracts";
import { describe, expect, it } from "vitest";
import { compactChannelEnvelopes } from "./messages-compaction";
import { toPersistedAgUiEvent } from "./persisted";

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

describe("compactChannelEnvelopes", () => {
  it("compacts completed text triples into MESSAGES_SNAPSHOT", () => {
    const full = [
      coworkerEnvelope(1, {
        type: "RUN_STARTED",
        threadId: "thread_1",
        runId: "run_1",
      }),
      coworkerEnvelope(2, {
        type: "TEXT_MESSAGE_START",
        messageId: "msg_1",
        role: "assistant",
      }),
      coworkerEnvelope(3, {
        type: "TEXT_MESSAGE_CONTENT",
        messageId: "msg_1",
        delta: "Hello",
      }),
      coworkerEnvelope(4, {
        type: "TEXT_MESSAGE_CONTENT",
        messageId: "msg_1",
        delta: " world",
      }),
      coworkerEnvelope(5, {
        type: "TEXT_MESSAGE_END",
        messageId: "msg_1",
      }),
      coworkerEnvelope(6, {
        type: "RUN_FINISHED",
        threadId: "thread_1",
        runId: "run_1",
        outcome: { type: "success" },
      }),
    ];

    const compacted = compactChannelEnvelopes(full);
    expect(compacted.map((envelope) => envelope.aguiEvent.type)).toEqual([
      "RUN_STARTED",
      "MESSAGES_SNAPSHOT",
      "RUN_FINISHED",
    ]);
    expect(compacted[1]?.channelSequence).toBe(2);
    expect(compacted[1]?.aguiEvent).toEqual({
      type: "MESSAGES_SNAPSHOT",
      messages: [{ id: "msg_1", role: "assistant", content: "Hello world" }],
    });
  });

  it("leaves incomplete text streams uncompacted", () => {
    const full = [
      coworkerEnvelope(1, {
        type: "TEXT_MESSAGE_START",
        messageId: "msg_1",
        role: "assistant",
      }),
      coworkerEnvelope(2, {
        type: "TEXT_MESSAGE_CONTENT",
        messageId: "msg_1",
        delta: "partial",
      }),
    ];
    expect(compactChannelEnvelopes(full)).toEqual(full);
  });
});

describe("toPersistedAgUiEvent MESSAGES_SNAPSHOT", () => {
  it("projects assistant snapshots and rejects empty message lists", () => {
    expect(
      toPersistedAgUiEvent({
        type: "MESSAGES_SNAPSHOT",
        messages: [{ id: "msg_1", role: "assistant", content: "Done" }],
        metadata: { provider: "hidden" },
      }),
    ).toEqual({
      type: "MESSAGES_SNAPSHOT",
      messages: [{ id: "msg_1", role: "assistant", content: "Done" }],
    });
    expect(
      toPersistedAgUiEvent({
        type: "MESSAGES_SNAPSHOT",
        messages: [],
      }),
    ).toBeNull();
  });
});
