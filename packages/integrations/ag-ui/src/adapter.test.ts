import { EventType } from "@ag-ui/core";
import { describe, expect, it } from "vitest";
import { TrueForgeAGUIAdapter } from "./adapter";
import { parseUpstreamAgUiEvent, parseUpstreamRunAgentInput } from "./upstream";

describe("parseUpstreamRunAgentInput", () => {
  it("accepts a valid RunAgentInput and rejects resume", () => {
    const valid = parseUpstreamRunAgentInput({
      threadId: "thread_channel_1_cow_1",
      runId: "run_1",
      messages: [{ id: "m1", role: "user", content: "Hello" }],
      tools: [],
      context: [],
      state: {},
    });
    expect(valid.ok).toBe(true);

    const resume = parseUpstreamRunAgentInput({
      threadId: "thread_channel_1_cow_1",
      runId: "run_1",
      messages: [],
      tools: [],
      context: [],
      state: {},
      resume: [{ interruptId: "int_1", payload: {} }],
    });
    expect(resume).toEqual({
      ok: false,
      capability: "RunAgentInput.resume",
      reason: "unsupported_in_p0",
    });
  });
});

describe("TrueForgeAGUIAdapter", () => {
  const context = {
    channelId: "channel_demo",
    coworkerId: "coworker_operator",
    logicalThreadId: "thread_channel_demo_coworker_operator",
    aguiRunId: "run_wire_attempt_1",
    applicationRunId: "run_app_1",
    runStepId: "step_run_1",
  };

  it("maps text lifecycle and success terminal events", () => {
    const adapter = new TrueForgeAGUIAdapter(context);
    const started = adapter.buildRunStarted();
    expect(started.type).toBe(EventType.RUN_STARTED);

    const delta = adapter.mapTrueForgeEvent({
      type: "model.message.delta",
      id: "evt_1",
      text: "Checking the repository issue list.",
    });
    expect(delta.map((event) => event.type)).toEqual([
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
    ]);

    const done = adapter.mapTrueForgeEvent({
      type: "turn.done",
      id: "evt_2",
      state: { required_actions: [] },
    });
    expect(done.at(-1)).toMatchObject({
      type: EventType.RUN_FINISHED,
      outcome: { type: "success" },
    });
    expect(parseUpstreamAgUiEvent(done.at(-1))).toMatchObject({ ok: true });
  });

  it("maps required actions to interrupt RUN_FINISHED", () => {
    const adapter = new TrueForgeAGUIAdapter(context);
    adapter.buildRunStarted();
    adapter.mapTrueForgeEvent({
      type: "model.message.delta",
      id: "evt_1",
      text: "Need approval.",
    });
    const done = adapter.mapTrueForgeEvent({
      type: "turn.done",
      id: "evt_2",
      state: {
        required_actions: [{ type: "tool.approval_required", id: "ra_1" }],
      },
    });
    expect(done.at(-1)).toMatchObject({
      type: EventType.RUN_FINISHED,
      outcome: {
        type: "interrupt",
        interrupts: [{ reason: "approval_required" }],
      },
    });
  });

  it("drops reasoning and unsupported provider events", () => {
    const adapter = new TrueForgeAGUIAdapter(context);
    expect(adapter.mapTrueForgeEvent({ type: "RAW", id: "evt_raw" })).toEqual([]);
    expect(adapter.mapTrueForgeEvent({ type: "REASONING_START", id: "evt_r" })).toEqual([]);
    expect(
      adapter.mapTrueForgeEvent({ type: "subagent.started", id: "evt_sub" }),
    ).toMatchObject([
      {
        type: EventType.ACTIVITY_SNAPSHOT,
        activityType: "forgeroom.coworker_work.v1",
      },
    ]);
  });
});
