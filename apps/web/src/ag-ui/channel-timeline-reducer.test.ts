import type { AgentChannelEnvelope, ChannelTimelineMessage } from "@forgeroom/contracts";
import { compactChannelEnvelopes } from "@forgeroom/ag-ui/browser";
import { describe, expect, it } from "vitest";
import {
  channelTimelineReducer,
  initialChannelTimelineState,
  orderedTimelineItems,
  orderedTimelineMessages,
  resolveActivityEntry,
} from "./channel-timeline-reducer";

function restMessage(
  overrides: Partial<ChannelTimelineMessage> &
    Pick<ChannelTimelineMessage, "id" | "channel_sequence">,
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
        restMessage({
          id: "msg_human",
          channel_sequence: 1,
          author_type: "human",
          body: "Hi team",
        }),
      ],
    });
    expect(state.messages["human:msg_human"]).toMatchObject({
      kind: "human",
      messageId: "msg_human",
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

  it("full text replay and compacted MESSAGES_SNAPSHOT replay match", () => {
    const full: AgentChannelEnvelope[] = [
      coworkerEnvelope(1, {
        type: "RUN_STARTED",
        threadId: "thread_coworker_research",
        runId: "agui_step_1",
      }),
      coworkerEnvelope(2, {
        type: "TEXT_MESSAGE_START",
        messageId: "assistant_message",
        role: "assistant",
      }),
      coworkerEnvelope(3, {
        type: "TEXT_MESSAGE_CONTENT",
        messageId: "assistant_message",
        delta: "Hello",
      }),
      coworkerEnvelope(4, {
        type: "TEXT_MESSAGE_CONTENT",
        messageId: "assistant_message",
        delta: " team",
      }),
      coworkerEnvelope(5, {
        type: "TEXT_MESSAGE_END",
        messageId: "assistant_message",
      }),
      coworkerEnvelope(6, {
        type: "RUN_FINISHED",
        threadId: "thread_coworker_research",
        runId: "agui_step_1",
        outcome: { type: "success" },
      }),
    ];

    let fullState = initialChannelTimelineState("channel_demo");
    for (const envelope of full) {
      fullState = channelTimelineReducer(fullState, { type: "event", envelope });
    }

    let compactedState = initialChannelTimelineState("channel_demo");
    for (const envelope of compactChannelEnvelopes(full)) {
      compactedState = channelTimelineReducer(compactedState, { type: "event", envelope });
    }

    expect(orderedTimelineMessages(compactedState)).toEqual(orderedTimelineMessages(fullState));
    expect(compactedState.runs).toEqual(fullState.runs);
  });

  it("records custom task events and forge room activities in timeline order", () => {
    let state = initialChannelTimelineState("channel_demo");
    state = channelTimelineReducer(state, {
      type: "event",
      envelope: {
        schemaVersion: 1,
        channelId: "channel_demo",
        channelSequence: 10,
        actorKind: "system",
        aguiEvent: {
          type: "CUSTOM",
          name: "task.created",
          payload: { schemaVersion: 1 },
        },
      },
    });
    state = channelTimelineReducer(state, {
      type: "event",
      envelope: coworkerEnvelope(11, {
        type: "ACTIVITY_SNAPSHOT",
        messageId: "act_task_1",
        activityType: "forgeroom.task_record.v1",
        replace: true,
        content: {
          schemaVersion: 1,
          activityRevision: 1,
          activityType: "forgeroom.task_record.v1",
          taskId: "task_1",
          revision: 1,
          status: "todo",
          title: "Inspect connector",
        },
      }),
    });

    const items = orderedTimelineItems(state);
    expect(items.map((item) => item.kind)).toEqual(["custom", "activity"]);
    expect(resolveActivityEntry(state.threadActivityStates, "act_task_1")?.content).toMatchObject({
      title: "Inspect connector",
    });
  });

  it("projects terminal custom run lifecycles out of running state", () => {
    let state = initialChannelTimelineState("channel_demo");
    state = channelTimelineReducer(state, {
      type: "event",
      envelope: coworkerEnvelope(20, {
        type: "CUSTOM",
        name: "run.completed",
        payload: { schemaVersion: 1, lifecycle: "completed" },
      }),
    });

    expect(state.runs.step_coworker_research?.status).toBe("complete");
    expect(state.runs.step_coworker_research?.lifecycle).toBe("completed");

    state = channelTimelineReducer(state, {
      type: "event",
      envelope: coworkerEnvelope(
        21,
        {
          type: "CUSTOM",
          name: "run.partial",
          payload: { schemaVersion: 1, lifecycle: "partial" },
        },
        "coworker_operator",
      ),
    });
    expect(state.runs.step_coworker_operator?.status).toBe("partial");
    expect(state.runs.step_coworker_operator?.lifecycle).toBe("partial");

    state = channelTimelineReducer(state, {
      type: "event",
      envelope: coworkerEnvelope(19, {
        type: "RUN_STARTED",
        threadId: "thread_coworker_research",
        runId: "agui_step_replayed",
      }),
    });
    expect(state.runs.step_coworker_research?.status).toBe("complete");
    expect(state.runs.step_coworker_research?.sequence).toBe(20);
  });

  it("retains applicationRunId on projected runs", () => {
    let state = initialChannelTimelineState("channel_demo");
    state = channelTimelineReducer(state, {
      type: "event",
      envelope: coworkerEnvelope(10, {
        type: "RUN_STARTED",
        threadId: "thread_coworker_research",
        runId: "agui_step_1",
      }),
    });
    expect(state.runs.step_coworker_research?.applicationRunId).toBe("run_demo");
  });

  it("folds channel and thread UI state without letting coworkers overwrite the channel lane", () => {
    const emptyCounters = {
      planning: 0,
      running: 0,
      awaiting_input: 0,
      awaiting_approval: 0,
      blocked_connection: 0,
      cancelling: 0,
      queued: 0,
    };
    let state = initialChannelTimelineState("channel_demo");
    state = channelTimelineReducer(state, {
      type: "event",
      envelope: {
        schemaVersion: 1,
        channelId: "channel_demo",
        channelSequence: 1,
        actorKind: "system",
        aguiEvent: {
          type: "STATE_SNAPSHOT",
          snapshot: {
            schemaVersion: 1,
            stateKind: "channel",
            revision: 1,
            channel: { id: "channel_demo", name: "General", archived: false },
            coworkers: {},
            runs: {},
            artifacts: {},
            tasks: {},
            uiInstances: {},
            pendingHumanActions: [],
          },
        },
      },
    });
    state = channelTimelineReducer(state, {
      type: "event",
      envelope: coworkerEnvelope(2, {
        type: "STATE_SNAPSHOT",
        snapshot: {
          schemaVersion: 1,
          stateKind: "thread",
          revision: 1,
          coworkerId: "coworker_research",
          logicalThreadId: "thread_coworker_research",
          phase: "running",
          activeRunStepIds: ["step_coworker_research"],
          surfaceIds: [],
        },
      }),
    });
    state = channelTimelineReducer(state, {
      type: "event",
      envelope: coworkerEnvelope(3, {
        type: "STATE_SNAPSHOT",
        snapshot: {
          schemaVersion: 1,
          stateKind: "channel",
          revision: 9,
          channel: { id: "channel_demo", name: "Hijacked", archived: false },
          coworkers: {},
          runs: { run_demo: { lifecycle: "active", counters: emptyCounters } },
          artifacts: {},
          tasks: {},
          uiInstances: {},
          pendingHumanActions: [],
        },
      }),
    });

    expect(state.uiState.channel?.channel.name).toBe("General");
    expect(state.uiState.needChannelSnapshot).toBe(true);
    expect(state.uiState.threads.thread_coworker_research?.phase).toBe("running");
  });

  it("keeps logical-turn busy state across a successful wire-run finish", () => {
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
      envelope: coworkerEnvelope(2, {
        type: "STATE_SNAPSHOT",
        snapshot: {
          schemaVersion: 1,
          stateKind: "thread",
          revision: 1,
          coworkerId: "coworker_research",
          logicalThreadId: "thread_coworker_research",
          phase: "running",
          activeRunStepIds: ["step_coworker_research"],
          surfaceIds: [],
        },
      }),
    });
    state = channelTimelineReducer(state, {
      type: "event",
      envelope: coworkerEnvelope(3, {
        type: "RUN_FINISHED",
        threadId: "thread_coworker_research",
        runId: "agui_step_1",
        outcome: { type: "success" },
      }),
    });

    expect(state.runs.step_coworker_research).toMatchObject({
      status: "running",
      lifecycle: "active",
    });
  });

  it("renders unsupported capability snapshots as inert activities", () => {
    let state = initialChannelTimelineState("channel_demo");
    state = channelTimelineReducer(state, {
      type: "event",
      envelope: coworkerEnvelope(12, {
        type: "ACTIVITY_SNAPSHOT",
        messageId: "act_unsup",
        activityType: "forgeroom.coworker_work.v1",
        replace: true,
        content: {
          phase: "unsupported_capability",
          summary: "Open generated UI is unavailable in P0",
          capability: "open_generated_ui",
        } as never,
      }),
    });
    expect(orderedTimelineItems(state)).toEqual([
      expect.objectContaining({ kind: "inert", key: "inert:act_unsup" }),
    ]);
  });

  it("projects TOOL_CALL_* events into per-thread tool timeline items", () => {
    let state = initialChannelTimelineState("channel_demo");
    state = channelTimelineReducer(state, {
      type: "event",
      envelope: coworkerEnvelope(30, {
        type: "TOOL_CALL_START",
        toolCallId: "tc_ui_1",
        toolCallName: "DataTable",
        parentMessageId: "assistant_message",
      }),
    });
    state = channelTimelineReducer(state, {
      type: "event",
      envelope: coworkerEnvelope(31, {
        type: "TOOL_CALL_ARGS",
        toolCallId: "tc_ui_1",
        delta: '{"title":"Open issues"}',
      }),
    });
    state = channelTimelineReducer(state, {
      type: "event",
      envelope: coworkerEnvelope(32, {
        type: "TOOL_CALL_END",
        toolCallId: "tc_ui_1",
      }),
    });

    const items = orderedTimelineItems(state);
    expect(items).toEqual([expect.objectContaining({ kind: "tool", toolCallId: "tc_ui_1" })]);
    expect(state.threadToolCallStates.thread_coworker_research?.toolCalls.tc_ui_1).toMatchObject({
      toolName: "DataTable",
      status: "complete",
    });
  });

  it("isolates per-thread activity reducers across coworkers", () => {
    let state = initialChannelTimelineState("channel_demo");
    state = channelTimelineReducer(state, {
      type: "event",
      envelope: coworkerEnvelope(40, {
        type: "ACTIVITY_SNAPSHOT",
        messageId: "act_research",
        activityType: "forgeroom.task_record.v1",
        replace: true,
        content: {
          schemaVersion: 1,
          activityRevision: 1,
          activityType: "forgeroom.task_record.v1",
          taskId: "task_research",
          revision: 1,
          status: "todo",
          title: "Research task",
        },
      }),
    });
    state = channelTimelineReducer(state, {
      type: "event",
      envelope: coworkerEnvelope(
        41,
        {
          type: "ACTIVITY_SNAPSHOT",
          messageId: "act_operator",
          activityType: "forgeroom.task_record.v1",
          replace: true,
          content: {
            schemaVersion: 1,
            activityRevision: 1,
            activityType: "forgeroom.task_record.v1",
            taskId: "task_operator",
            revision: 1,
            status: "in_progress",
            title: "Operator task",
          },
        },
        "coworker_operator",
      ),
    });

    expect(
      state.threadActivityStates.thread_coworker_research?.activities.act_research?.content,
    ).toMatchObject({ title: "Research task" });
    expect(
      state.threadActivityStates.thread_coworker_operator?.activities.act_operator?.content,
    ).toMatchObject({ title: "Operator task" });
  });

  it("renders one human sourceMessageId once across fan-out merges", () => {
    let state = initialChannelTimelineState("channel_demo");
    state = channelTimelineReducer(state, {
      type: "merge_messages",
      messages: [
        restMessage({
          id: "msg_fanout",
          channel_sequence: 1,
          author_type: "human",
          body: "Check both repos",
        }),
      ],
    });
    state = channelTimelineReducer(state, {
      type: "merge_messages",
      messages: [
        restMessage({
          id: "msg_fanout",
          channel_sequence: 1,
          author_type: "human",
          body: "Check both repos",
        }),
      ],
    });
    state = channelTimelineReducer(state, {
      type: "event",
      envelope: {
        ...coworkerEnvelope(2, {
          type: "RUN_STARTED",
          threadId: "thread_coworker_research",
          runId: "agui_step_1",
        }),
        sourceMessageId: "msg_fanout",
      },
    });
    state = channelTimelineReducer(state, {
      type: "event",
      envelope: {
        ...coworkerEnvelope(
          3,
          {
            type: "RUN_STARTED",
            threadId: "thread_coworker_operator",
            runId: "agui_step_2",
          },
          "coworker_operator",
        ),
        sourceMessageId: "msg_fanout",
      },
    });

    expect(orderedTimelineMessages(state)).toHaveLength(1);
    expect(state.projectedSourceMessageIds.msg_fanout).toBe(true);
    expect(Object.keys(state.runs)).toHaveLength(2);
  });
});
