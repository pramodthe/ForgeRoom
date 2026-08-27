import type { AgentChannelEnvelope, ChannelTimelineMessage } from "@forgeroom/contracts";
import { describe, expect, it } from "vitest";
import {
  channelTimelineReducer,
  initialChannelTimelineState,
  orderedTimelineMessages,
} from "./channel-timeline-reducer";

function restMessage(
  overrides: Partial<ChannelTimelineMessage> & Pick<ChannelTimelineMessage, "id" | "channel_sequence">,
): ChannelTimelineMessage {
  return {
    schemaVersion: 1,
    channel_id: "channel_demo",
    author_type: "human",
    author_id: "user_demo",
    body: "hello",
    parent_message_id: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function coworkerEnvelope(
  sequence: number,
  event: AgentChannelEnvelope["aguiEvent"],
  coworkerId = "coworker_research",
): AgentChannelEnvelope {
  return {
    schemaVersion: 1,
    channelId: "channel_demo",
    channelSequence: sequence,
    applicationRunId: "run_demo",
    runStepId: `step_${coworkerId}`,
    agentTurnId: `turn_${coworkerId}`,
    actorKind: "coworker",
    coworkerId,
    logicalThreadId: `thread_${coworkerId}`,
    sourceMessageId: "message_demo",
    aguiEvent: event,
  };
}

describe("channelTimelineReducer", () => {
  it("deduplicates replayed text deltas", () => {
    let state = initialChannelTimelineState("channel_demo");
    const delta = coworkerEnvelope(3, {
      type: "TEXT_MESSAGE_CONTENT",
      messageId: "assistant_message",
      delta: "hello",
    });
    state = channelTimelineReducer(state, { type: "event", envelope: delta });
    state = channelTimelineReducer(state, { type: "event", envelope: delta });
    expect(orderedTimelineMessages(state)[0]?.content).toBe("hello");
  });

  it("keeps interleaved coworker streams isolated", () => {
    let state = initialChannelTimelineState("channel_demo");
    state = channelTimelineReducer(state, {
      type: "event",
      envelope: coworkerEnvelope(2, {
        type: "TEXT_MESSAGE_CONTENT",
        messageId: "assistant_message",
        delta: "research",
      }),
    });
    state = channelTimelineReducer(state, {
      type: "event",
      envelope: coworkerEnvelope(
        3,
        { type: "TEXT_MESSAGE_CONTENT", messageId: "assistant_message", delta: "operations" },
        "coworker_operator",
      ),
    });
    expect(orderedTimelineMessages(state).map((message) => message.content)).toEqual([
      "research",
      "operations",
    ]);
  });

  it("projects run lifecycle without exposing raw provider payloads", () => {
    let state = initialChannelTimelineState("channel_demo");
    state = channelTimelineReducer(state, {
      type: "event",
      envelope: coworkerEnvelope(1, {
        type: "RUN_STARTED",
        threadId: "thread_coworker_research",
        runId: "agui_step_1",
      }),
    });
    state = channelTimelineReducer(state, {
      type: "event",
      envelope: coworkerEnvelope(4, {
        type: "RUN_ERROR",
        threadId: "thread_coworker_research",
        runId: "agui_step_1",
        message: "The coworker run failed safely.",
      }),
    });
    expect(state.runs.step_coworker_research).toMatchObject({
      status: "failed",
      message: "The coworker run failed safely.",
    });
  });

  it("keys human REST rows as human:id only", () => {
    let state = initialChannelTimelineState("channel_demo");
    state = channelTimelineReducer(state, {
      type: "merge_messages",
      messages: [
        restMessage({ id: "msg_human", channel_sequence: 1, author_type: "human", body: "Hi team" }),
      ],
    });
    expect(state.messages["human:msg_human"]).toMatchObject({
      kind: "human",
      content: "Hi team",
      status: "sent",
    });
    expect(Object.keys(state.messages)).toEqual(["human:msg_human"]);
  });

  it("keys coworker REST rows by sequence and skips stream-owned sequences", () => {
    let state = initialChannelTimelineState("channel_demo");
    state = channelTimelineReducer(state, {
      type: "event",
      envelope: coworkerEnvelope(2, {
        type: "TEXT_MESSAGE_CONTENT",
        messageId: "assistant_message",
        delta: "streamed",
      }),
    });
    state = channelTimelineReducer(state, {
      type: "merge_messages",
      messages: [
        restMessage({
          id: "msg_coworker",
          channel_sequence: 2,
          author_type: "coworker",
          author_id: "coworker_research",
          body: "persisted",
        }),
      ],
    });
    expect(Object.keys(state.messages)).toEqual(["thread_coworker_research:assistant_message"]);
    expect(orderedTimelineMessages(state)[0]?.content).toBe("streamed");
  });

  it("replaces coworker REST placeholders when stream events arrive", () => {
    let state = initialChannelTimelineState("channel_demo");
    state = channelTimelineReducer(state, {
      type: "merge_messages",
      messages: [
        restMessage({
          id: "msg_coworker",
          channel_sequence: 5,
          author_type: "coworker",
          author_id: "coworker_research",
          body: "persisted",
        }),
      ],
    });
    expect(state.messages["seq:5"]).toMatchObject({ content: "persisted" });
    state = channelTimelineReducer(state, {
      type: "event",
      envelope: coworkerEnvelope(5, {
        type: "TEXT_MESSAGE_CONTENT",
        messageId: "assistant_message",
        delta: "live",
      }),
    });
    expect(state.messages["seq:5"]).toBeUndefined();
    expect(state.messages["thread_coworker_research:assistant_message"]?.content).toBe("live");
    expect(orderedTimelineMessages(state)).toHaveLength(1);
  });

  it("does not clobber streaming messages during REST merge", () => {
    let state = initialChannelTimelineState("channel_demo");
    state = channelTimelineReducer(state, {
      type: "event",
      envelope: coworkerEnvelope(6, {
        type: "TEXT_MESSAGE_CONTENT",
        messageId: "assistant_message",
        delta: "partial",
      }),
    });
    state = channelTimelineReducer(state, {
      type: "merge_messages",
      messages: [
        restMessage({
          id: "msg_coworker",
          channel_sequence: 6,
          author_type: "coworker",
          author_id: "coworker_research",
          body: "stale persisted",
        }),
      ],
    });
    expect(orderedTimelineMessages(state)[0]).toMatchObject({
      content: "partial",
      status: "streaming",
    });
  });
});
