import type { AgentChannelEnvelope } from "@forgeroom/contracts";
import { describe, expect, it } from "vitest";
import {
  initialToolCallPresentationState,
  reduceToolCallPresentationState,
} from "./tool-call-reducer";

function coworkerEnvelope(
  event: AgentChannelEnvelope["aguiEvent"],
  coworkerId = "coworker_research",
): AgentChannelEnvelope {
  return {
    schemaVersion: 1,
    channelId: "channel_demo",
    channelSequence: 1,
    applicationRunId: "run_demo",
    runStepId: "step_1",
    agentTurnId: "turn_1",
    actorKind: "coworker",
    coworkerId,
    logicalThreadId: `thread_${coworkerId}`,
    aguiEvent: event,
  };
}

describe("reduceToolCallPresentationState", () => {
  it("tracks tool call lifecycle without retaining argument deltas", () => {
    let state = initialToolCallPresentationState();
    state = reduceToolCallPresentationState(
      state,
      coworkerEnvelope({
        type: "TOOL_CALL_START",
        toolCallId: "tc_1",
        toolCallName: "DataTable",
        parentMessageId: "msg_1",
      }),
    );
    state = reduceToolCallPresentationState(
      state,
      coworkerEnvelope({
        type: "TOOL_CALL_ARGS",
        toolCallId: "tc_1",
        delta: '{"title":"Open issues"}',
      }),
    );
    state = reduceToolCallPresentationState(
      state,
      coworkerEnvelope({
        type: "TOOL_CALL_END",
        toolCallId: "tc_1",
      }),
    );
    state = reduceToolCallPresentationState(
      state,
      coworkerEnvelope({
        type: "TOOL_CALL_RESULT",
        messageId: "msg_tool_1",
        toolCallId: "tc_1",
        content: '{"rendered":true}',
        role: "tool",
      }),
    );

    expect(state.toolCalls.tc_1).toMatchObject({
      toolCallId: "tc_1",
      toolName: "DataTable",
      status: "complete",
      parentMessageId: "msg_1",
      owner: {
        actorKind: "coworker",
        coworkerId: "coworker_research",
        logicalThreadId: "thread_coworker_research",
      },
    });
    expect(state.toolCalls.tc_1).not.toHaveProperty("args");
  });

  it("isolates tool calls across coworker lanes", () => {
    let state = initialToolCallPresentationState();
    state = reduceToolCallPresentationState(
      state,
      coworkerEnvelope({
        type: "TOOL_CALL_START",
        toolCallId: "tc_shared",
        toolCallName: "Search",
      }),
    );
    state = reduceToolCallPresentationState(
      state,
      coworkerEnvelope(
        {
          type: "TOOL_CALL_START",
          toolCallId: "tc_shared",
          toolCallName: "Search",
        },
        "coworker_operator",
      ),
    );

    expect(Object.keys(state.toolCalls)).toEqual(["tc_shared"]);
    expect(state.toolCalls.tc_shared?.owner.coworkerId).toBe("coworker_research");
  });
});
