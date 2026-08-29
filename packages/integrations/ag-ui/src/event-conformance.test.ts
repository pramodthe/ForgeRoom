import { EventType } from "@ag-ui/core";
import type { AgentChannelEnvelope } from "@forgeroom/contracts";
import { readProviderFixtureJson } from "@forgeroom/test-fixtures";
import { describe, expect, it } from "vitest";
import {
  initialActivityPresentationState,
  reduceActivityPresentationState,
} from "./activity-reducer";
import { parseAgUiSseBody, parseTrueForgeStreamFixture } from "./stream-parser";
import {
  initialToolCallPresentationState,
  reduceToolCallPresentationState,
} from "./tool-call-reducer";
import { initialUiPresentationState, reduceUiPresentationState } from "./ui-state-reducer";
import { parseUpstreamAgUiEvent } from "./upstream";

type EventProfileFixture = {
  successEvents: AgentChannelEnvelope["aguiEvent"][];
  errorEvents: AgentChannelEnvelope["aguiEvent"][];
  illegalOrdering: {
    stateDeltaBeforeSnapshot: AgentChannelEnvelope["aguiEvent"];
    activityDeltaBeforeSnapshot: AgentChannelEnvelope["aguiEvent"];
    toolArgsBeforeStart: AgentChannelEnvelope["aguiEvent"];
  };
};

function loadFixture(): EventProfileFixture {
  return readProviderFixtureJson<EventProfileFixture>("ag-ui/p0-event-profile.fixture.json");
}

function asSse(events: AgentChannelEnvelope["aguiEvent"][]): string {
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
}

function envelope(event: AgentChannelEnvelope["aguiEvent"]): AgentChannelEnvelope {
  return {
    schemaVersion: 1,
    channelId: "channel_conformance",
    channelSequence: 1,
    actorKind: "coworker",
    coworkerId: "coworker_conformance",
    logicalThreadId: "thread_conformance",
    aguiEvent: event,
  };
}

describe("P0 AG-UI event conformance", () => {
  it("parses every required event family through the pinned official client", async () => {
    const fixture = loadFixture();
    const golden = await parseTrueForgeStreamFixture();
    const supplemental = await parseAgUiSseBody(asSse(fixture.successEvents));
    const error = await parseAgUiSseBody(asSse(fixture.errorEvents));
    const observed = new Set([...golden, ...supplemental, ...error].map((event) => event.type));
    for (const event of [...fixture.successEvents, ...fixture.errorEvents]) {
      expect(parseUpstreamAgUiEvent(event)).toMatchObject({ ok: true });
    }

    expect(observed).toEqual(
      new Set([
        EventType.RUN_STARTED,
        EventType.RUN_FINISHED,
        EventType.RUN_ERROR,
        EventType.STEP_STARTED,
        EventType.STEP_FINISHED,
        EventType.TEXT_MESSAGE_START,
        EventType.TEXT_MESSAGE_CONTENT,
        EventType.TEXT_MESSAGE_END,
        EventType.TOOL_CALL_START,
        EventType.TOOL_CALL_ARGS,
        EventType.TOOL_CALL_END,
        EventType.TOOL_CALL_RESULT,
        EventType.MESSAGES_SNAPSHOT,
        EventType.STATE_SNAPSHOT,
        EventType.STATE_DELTA,
        EventType.ACTIVITY_SNAPSHOT,
        EventType.ACTIVITY_DELTA,
        EventType.CUSTOM,
      ]),
    );
  });

  it("fails closed when deltas or arguments arrive before their required start", () => {
    const fixture = loadFixture();
    const state = reduceUiPresentationState(
      initialUiPresentationState(),
      envelope(fixture.illegalOrdering.stateDeltaBeforeSnapshot),
    );
    expect(state.threads).toEqual({});
    expect(state.needThreadSnapshots).toEqual({ thread_conformance: true });

    const activity = reduceActivityPresentationState(
      initialActivityPresentationState(),
      envelope(fixture.illegalOrdering.activityDeltaBeforeSnapshot),
    );
    expect(activity.activities).toEqual({});
    expect(activity.needActivitySnapshots).toEqual({ act_missing: true });

    const tools = reduceToolCallPresentationState(
      initialToolCallPresentationState(),
      envelope(fixture.illegalOrdering.toolArgsBeforeStart),
    );
    expect(tools.toolCalls).toEqual({});
  });
});
