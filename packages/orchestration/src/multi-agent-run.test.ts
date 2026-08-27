import { describe, expect, it } from "vitest";
import {
  activityBucketForStepState,
  aggregateRunFromSteps,
  buildCoworkerTurnInputRef,
  humanTranscriptProjectionCount,
  planDirectRunSteps,
} from "./multi-agent-run";

describe("planDirectRunSteps", () => {
  const recipients = [
    {
      coworkerId: "cw_1",
      handle: "analyst",
      channelAgentSessionId: "cas_1",
      logicalThreadId: "thread_1",
    },
    {
      coworkerId: "cw_2",
      handle: "researcher",
      channelAgentSessionId: "cas_2",
      logicalThreadId: "thread_2",
    },
  ];

  it("plans one step per recipient with the shared goal", () => {
    const plan = planDirectRunSteps({ goal: "Inspect the PR", recipients });
    expect(plan).toEqual({
      ok: true,
      steps: [
        {
          assignedCoworkerId: "cw_1",
          handle: "analyst",
          channelAgentSessionId: "cas_1",
          logicalThreadId: "thread_1",
          objective: "Inspect the PR",
        },
        {
          assignedCoworkerId: "cw_2",
          handle: "researcher",
          channelAgentSessionId: "cas_2",
          logicalThreadId: "thread_2",
          objective: "Inspect the PR",
        },
      ],
    });
  });

  it("rejects empty, duplicate, recursive, and native-subagent plans", () => {
    expect(planDirectRunSteps({ goal: "x", recipients: [] })).toEqual({
      ok: false,
      reason: "empty_recipients",
    });
    expect(
      planDirectRunSteps({
        goal: "x",
        recipients: [recipients[0]!, { ...recipients[1]!, coworkerId: "cw_1" }],
      }),
    ).toEqual({ ok: false, reason: "duplicate_coworker" });
    expect(
      planDirectRunSteps({
        goal: "x",
        recipients: [recipients[0]!, { ...recipients[1]!, channelAgentSessionId: "cas_1" }],
      }),
    ).toEqual({ ok: false, reason: "duplicate_session" });
    expect(planDirectRunSteps({ goal: "x", recipients, recursiveDispatch: true })).toEqual({
      ok: false,
      reason: "recursive_dispatch_forbidden",
    });
    expect(planDirectRunSteps({ goal: "x", recipients, nativeSubagents: true })).toEqual({
      ok: false,
      reason: "native_subagent_forbidden",
    });
  });
});

describe("aggregateRunFromSteps", () => {
  it("keeps lifecycle distinct from simultaneous activity counters", () => {
    const projection = aggregateRunFromSteps([
      { state: "running" },
      { state: "awaiting_approval" },
    ]);
    expect(projection.lifecycle).toBe("active");
    expect(projection.activity).toEqual({
      planning: 0,
      running: 1,
      awaiting_input: 0,
      awaiting_approval: 1,
      blocked_connection: 0,
      cancelling: 0,
      queued: 0,
    });
  });

  it("maps queued-only, mixed terminals, and unknown truthfully", () => {
    expect(aggregateRunFromSteps([{ state: "queued" }, { state: "queued" }]).lifecycle).toBe(
      "queued",
    );
    expect(aggregateRunFromSteps([{ state: "completed" }, { state: "completed" }]).lifecycle).toBe(
      "completed",
    );
    expect(aggregateRunFromSteps([{ state: "failed" }, { state: "failed" }]).lifecycle).toBe(
      "failed",
    );
    expect(aggregateRunFromSteps([{ state: "cancelled" }, { state: "cancelled" }]).lifecycle).toBe(
      "cancelled",
    );
    expect(aggregateRunFromSteps([{ state: "completed" }, { state: "failed" }]).lifecycle).toBe(
      "partial",
    );
    expect(aggregateRunFromSteps([{ state: "completed" }, { state: "unknown" }]).lifecycle).toBe(
      "partial",
    );
    expect(aggregateRunFromSteps([{ state: "unknown" }, { state: "unknown" }]).lifecycle).toBe(
      "partial",
    );
    expect(aggregateRunFromSteps([{ state: "completed" }, { state: "queued" }]).lifecycle).toBe(
      "active",
    );
  });

  it("buckets acquiring_session as planning", () => {
    expect(activityBucketForStepState("acquiring_session")).toBe("planning");
    expect(aggregateRunFromSteps([{ state: "acquiring_session" }])).toEqual({
      lifecycle: "active",
      activity: {
        planning: 1,
        running: 0,
        awaiting_input: 0,
        awaiting_approval: 0,
        blocked_connection: 0,
        cancelling: 0,
        queued: 0,
      },
    });
  });
});

describe("sourceMessageId fan-out", () => {
  it("references one human message without duplicate lane transcripts", () => {
    const refs = [
      buildCoworkerTurnInputRef({
        sourceMessageId: "msg_1",
        applicationRunId: "run_1",
        runStepId: "step_1",
        coworkerId: "cw_1",
        logicalThreadId: "thread_1",
      }),
      buildCoworkerTurnInputRef({
        sourceMessageId: "msg_1",
        applicationRunId: "run_1",
        runStepId: "step_2",
        coworkerId: "cw_2",
        logicalThreadId: "thread_2",
      }),
    ];
    expect(refs.every((ref) => ref.emitHumanTranscript === false)).toBe(true);
    expect(
      humanTranscriptProjectionCount({ sourceMessageId: "msg_1", coworkerInputs: refs }),
    ).toEqual({
      sourceMessageId: "msg_1",
      projectedOnce: true,
      duplicateLaneTranscripts: 0,
    });
  });
});
