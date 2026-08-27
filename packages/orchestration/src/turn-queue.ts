export const TURN_QUEUE_INPUT_TYPES = [
  "normal",
  "pause_group_response",
  "component_interaction_response",
  "correction",
] as const;

export type TurnQueueInputType = (typeof TURN_QUEUE_INPUT_TYPES)[number];

/** Higher wins over lower when claiming. */
export const TURN_QUEUE_PRIORITY: Record<TurnQueueInputType, number> = {
  pause_group_response: 100,
  component_interaction_response: 50,
  correction: 10,
  normal: 0,
};

export function priorityForInputType(inputType: TurnQueueInputType): number {
  return TURN_QUEUE_PRIORITY[inputType];
}

export type ChannelAgentSessionClaimState = "active" | "rotating" | "disabled";

export type ClaimEligibility =
  { ok: true } | { ok: false; reason: "session_rotating" | "session_disabled" | "session_busy" };

/** Pure eligibility before a claim transaction. */
export function evaluateClaimEligibility(input: {
  sessionState: ChannelAgentSessionClaimState;
  hasRemoteActiveTurn: boolean;
}): ClaimEligibility {
  if (input.sessionState === "rotating") {
    return { ok: false, reason: "session_rotating" };
  }
  if (input.sessionState === "disabled") {
    return { ok: false, reason: "session_disabled" };
  }
  if (input.hasRemoteActiveTurn) {
    return { ok: false, reason: "session_busy" };
  }
  return { ok: true };
}

/**
 * Whether a queued item may bind/rebind to the current live generation on claim.
 * Response/component items never rebind; they must already match the live generation or are stale.
 */
export function resolveClaimGenerationBinding(input: {
  inputType: TurnQueueInputType;
  boundGenerationId: string | null;
  currentGenerationId: string | null;
}):
  | { ok: true; boundGenerationId: string }
  | { ok: false; reason: "missing_generation" | "stale_generation" } {
  if (!input.currentGenerationId) {
    return { ok: false, reason: "missing_generation" };
  }
  if (input.inputType === "normal") {
    return { ok: true, boundGenerationId: input.currentGenerationId };
  }
  if (!input.boundGenerationId) {
    return { ok: false, reason: "missing_generation" };
  }
  if (input.boundGenerationId !== input.currentGenerationId) {
    return { ok: false, reason: "stale_generation" };
  }
  return { ok: true, boundGenerationId: input.boundGenerationId };
}

/** Claim SELECT ordering: priority DESC, then FIFO ascending. */
export function compareClaimOrder(
  a: { priority: number; fifoSequence: number },
  b: { priority: number; fifoSequence: number },
): number {
  if (a.priority !== b.priority) {
    return b.priority - a.priority;
  }
  return a.fifoSequence - b.fifoSequence;
}
