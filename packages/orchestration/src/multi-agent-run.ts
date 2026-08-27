import type { RunActivityCounters, RunLifecycle, RunStepState } from "@forgeroom/contracts";

export type DirectRunRecipient = {
  coworkerId: string;
  handle: string;
  channelAgentSessionId: string;
  logicalThreadId: string;
};

export type DirectRunStepPlan = {
  assignedCoworkerId: string;
  handle: string;
  channelAgentSessionId: string;
  logicalThreadId: string;
  objective: string;
};

export type PlanDirectRunStepsResult =
  | { ok: true; steps: DirectRunStepPlan[] }
  | {
      ok: false;
      reason:
        | "empty_recipients"
        | "duplicate_coworker"
        | "duplicate_session"
        | "recursive_dispatch_forbidden"
        | "native_subagent_forbidden";
    };

/**
 * P0 direct fan-out: one RunStep per distinct persistent coworker session.
 * Never plans recursive coworker dispatch or native subagents.
 */
export function planDirectRunSteps(input: {
  goal: string;
  recipients: DirectRunRecipient[];
  /** Always false in P0; rejected if true. */
  recursiveDispatch?: boolean;
  /** Always false in P0; rejected if true. */
  nativeSubagents?: boolean;
}): PlanDirectRunStepsResult {
  if (input.recursiveDispatch) {
    return { ok: false, reason: "recursive_dispatch_forbidden" };
  }
  if (input.nativeSubagents) {
    return { ok: false, reason: "native_subagent_forbidden" };
  }
  if (input.recipients.length === 0) {
    return { ok: false, reason: "empty_recipients" };
  }

  const coworkerIds = new Set<string>();
  const sessionIds = new Set<string>();
  const steps: DirectRunStepPlan[] = [];
  const goal = input.goal.trim() || "Respond to the channel message";

  for (const recipient of input.recipients) {
    if (coworkerIds.has(recipient.coworkerId)) {
      return { ok: false, reason: "duplicate_coworker" };
    }
    if (sessionIds.has(recipient.channelAgentSessionId)) {
      return { ok: false, reason: "duplicate_session" };
    }
    coworkerIds.add(recipient.coworkerId);
    sessionIds.add(recipient.channelAgentSessionId);
    steps.push({
      assignedCoworkerId: recipient.coworkerId,
      handle: recipient.handle,
      channelAgentSessionId: recipient.channelAgentSessionId,
      logicalThreadId: recipient.logicalThreadId,
      objective: goal,
    });
  }

  return { ok: true, steps };
}

const EMPTY_ACTIVITY: RunActivityCounters = {
  planning: 0,
  running: 0,
  awaiting_input: 0,
  awaiting_approval: 0,
  blocked_connection: 0,
  cancelling: 0,
  queued: 0,
};

/** Map a RunStep state into the concurrent activity counter bucket (or null when terminal). */
export function activityBucketForStepState(state: RunStepState): keyof RunActivityCounters | null {
  switch (state) {
    case "queued":
      return "queued";
    case "acquiring_session":
      return "planning";
    case "running":
      return "running";
    case "awaiting_input":
      return "awaiting_input";
    case "awaiting_approval":
      return "awaiting_approval";
    case "blocked_connection":
      return "blocked_connection";
    case "cancelling":
      return "cancelling";
    default:
      return null;
  }
}

/**
 * Derive Run lifecycle + simultaneous activity counters from step states.
 * Does not synthesize a coordinator outcome — mixed terminals become `partial`.
 */
export function aggregateRunFromSteps(steps: ReadonlyArray<{ state: RunStepState }>): {
  lifecycle: RunLifecycle;
  activity: RunActivityCounters;
} {
  const activity: RunActivityCounters = { ...EMPTY_ACTIVITY };
  if (steps.length === 0) {
    return { lifecycle: "queued", activity };
  }

  let terminalCompleted = 0;
  let terminalFailed = 0;
  let terminalCancelled = 0;
  let terminalUnknown = 0;
  let nonTerminal = 0;
  let allStepsQueued = true;

  for (const step of steps) {
    if (step.state !== "queued") {
      allStepsQueued = false;
    }
    const bucket = activityBucketForStepState(step.state);
    if (bucket) {
      activity[bucket] += 1;
      nonTerminal += 1;
      continue;
    }
    if (step.state === "completed") terminalCompleted += 1;
    else if (step.state === "failed") terminalFailed += 1;
    else if (step.state === "cancelled") terminalCancelled += 1;
    else if (step.state === "unknown") terminalUnknown += 1;
  }

  if (nonTerminal > 0) {
    return { lifecycle: allStepsQueued ? "queued" : "active", activity };
  }

  const terminalCount = terminalCompleted + terminalFailed + terminalCancelled + terminalUnknown;
  if (terminalCount === 0) {
    return { lifecycle: "queued", activity };
  }
  if (terminalUnknown > 0) {
    return { lifecycle: "partial", activity };
  }
  if (terminalCompleted === terminalCount) {
    return { lifecycle: "completed", activity };
  }
  if (terminalFailed === terminalCount) {
    return { lifecycle: "failed", activity };
  }
  if (terminalCancelled === terminalCount) {
    return { lifecycle: "cancelled", activity };
  }
  return { lifecycle: "partial", activity };
}

/**
 * Per-coworker AG-UI/turn input references the single channel-owned human message.
 * Never emit a duplicate human transcript projection in the coworker lane.
 */
export type CoworkerTurnInputRef = {
  sourceMessageId: string;
  applicationRunId: string;
  runStepId: string;
  coworkerId: string;
  logicalThreadId: string;
  /** Human TEXT_MESSAGE_* must not be re-emitted on fan-out lanes. */
  emitHumanTranscript: false;
};

export function buildCoworkerTurnInputRef(input: {
  sourceMessageId: string;
  applicationRunId: string;
  runStepId: string;
  coworkerId: string;
  logicalThreadId: string;
}): CoworkerTurnInputRef {
  return {
    sourceMessageId: input.sourceMessageId,
    applicationRunId: input.applicationRunId,
    runStepId: input.runStepId,
    coworkerId: input.coworkerId,
    logicalThreadId: input.logicalThreadId,
    emitHumanTranscript: false,
  };
}

/** Channel transcript projects the human sourceMessageId once across all coworker inputs. */
export function humanTranscriptProjectionCount(input: {
  sourceMessageId: string;
  coworkerInputs: ReadonlyArray<
    Pick<CoworkerTurnInputRef, "sourceMessageId" | "emitHumanTranscript">
  >;
}): { sourceMessageId: string; projectedOnce: true; duplicateLaneTranscripts: 0 } {
  for (const ref of input.coworkerInputs) {
    if (ref.sourceMessageId !== input.sourceMessageId) {
      throw new Error("coworker turn input must reference the channel-owned sourceMessageId");
    }
    if (ref.emitHumanTranscript !== false) {
      throw new Error("coworker turn input must not emit a duplicate human transcript");
    }
  }
  return {
    sourceMessageId: input.sourceMessageId,
    projectedOnce: true,
    duplicateLaneTranscripts: 0,
  };
}
