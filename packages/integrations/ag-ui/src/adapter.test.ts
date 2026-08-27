import { EventType } from "@ag-ui/core";
import { describe, expect, it } from "vitest";
import { pollTrueForgeTurnEvents, TrueForgeAGUIAdapter } from "./adapter";
import { parseUpstreamAgUiEvent, parseUpstreamRunAgentInput } from "./upstream";

describe("parseUpstreamRunAgentInput", () => {
  it("accepts a valid RunAgentInput and flags resume for PauseGroup service", () => {
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
      resume: [{ interruptId: "int_1", status: "resolved" }],
    });
    expect(resume).toMatchObject({
      ok: true,
      resumeRequiresPauseGroupService: true,
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
    expect(adapter.mapTrueForgeEvent({ type: "subagent.started", id: "evt_sub" })).toMatchObject([
      {
        type: EventType.ACTIVITY_SNAPSHOT,
        activityType: "forgeroom.coworker_work.v1",
      },
    ]);
  });

  it("redacts provider error details from RUN_ERROR", () => {
    const adapter = new TrueForgeAGUIAdapter(context);
    const events = adapter.mapTrueForgeEvent({
      type: "turn.error",
      id: "evt_error",
      message: "session tf_secret_session turn tf_secret_turn failed",
    });
    expect(events.at(-1)).toMatchObject({
      type: EventType.RUN_ERROR,
      message: "TrueForge run failed.",
    });
    expect(JSON.stringify(events)).not.toContain("tf_secret");
  });

  it("delivers mapped events while polling and dedupes unsupported history", async () => {
    const adapter = new TrueForgeAGUIAdapter(context);
    const delivered: Array<Record<string, unknown>> = [];
    let polls = 0;

    await pollTrueForgeTurnEvents({
      sessionId: "tf_session_private",
      turnId: "tf_turn_private",
      adapter,
      intervalMs: 0,
      listEvents: async () => {
        polls += 1;
        if (polls === 1) {
          return [
            { type: "subagent.started", id: "evt_sub" },
            { type: "model.message.delta", id: "evt_text", text: "Live output" },
          ];
        }
        expect(delivered.some((event) => event.type === EventType.TEXT_MESSAGE_CONTENT)).toBe(true);
        return [
          { type: "subagent.started", id: "evt_sub" },
          { type: "model.message.delta", id: "evt_text", text: "Live output" },
          { type: "turn.done", id: "evt_done", state: { required_actions: [] } },
        ];
      },
      onEvent: async (event) => {
        delivered.push(event);
      },
    });

    expect(delivered.filter((event) => event.type === EventType.ACTIVITY_SNAPSHOT)).toHaveLength(1);
    expect(delivered.at(-1)?.type).toBe(EventType.RUN_FINISHED);
  });
});
