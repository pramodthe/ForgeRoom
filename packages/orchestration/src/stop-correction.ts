import type { AgentChannelEnvelope } from "@forgeroom/contracts";

export type StoppableStepState =
  | "queued"
  | "acquiring_session"
  | "running"
  | "awaiting_input"
  | "awaiting_approval"
  | "blocked_connection"
  | "cancelling"
  | "cancelled"
  | "completed"
  | "failed"
  | "unknown";

export type StopDecision =
  | { action: "enter_cancelling"; callCancel: true }
  | { action: "already_cancelling"; callCancel: false }
  | { action: "already_settled"; callCancel: false }
  | { action: "not_stoppable"; callCancel: false; reason: "run_not_stoppable" };

/** Stop is explicit: enter cancelling once and call provider cancel at most once. */
export function decideStop(stepState: StoppableStepState): StopDecision {
  if (stepState === "cancelling") {
    return { action: "already_cancelling", callCancel: false };
  }
  if (stepState === "cancelled" || stepState === "completed" || stepState === "failed") {
    return { action: "already_settled", callCancel: false };
  }
  if (
    stepState === "running" ||
    stepState === "awaiting_input" ||
    stepState === "awaiting_approval" ||
    stepState === "blocked_connection" ||
    stepState === "acquiring_session" ||
    stepState === "queued"
  ) {
    return { action: "enter_cancelling", callCancel: true };
  }
  return { action: "not_stoppable", callCancel: false, reason: "run_not_stoppable" };
}

/** Normal messages never implicitly stop work — they only enqueue. */
export function normalMessageImpliesStop(): false {
  return false;
}

export type CorrectionQueueIntent = {
  inputType: "correction";
  priorRunStepId: string;
  content: string;
};

export function buildCorrectionQueueIntent(input: {
  priorRunStepId: string;
  content: string;
}): CorrectionQueueIntent {
  if (!input.priorRunStepId.trim()) {
    throw new Error("correction requires priorRunStepId");
  }
  if (!input.content.trim()) {
    throw new Error("correction requires content");
  }
  return {
    inputType: "correction",
    priorRunStepId: input.priorRunStepId,
    content: input.content.trim(),
  };
}

export type RestartTurnMark = {
  state: "uncertain";
  needsAttention: true;
  reason: "process_restart";
  autoRetry: false;
};

/** Fail-closed restart: mark active remote work needs_attention without auto-retry. */
export function markNeedsAttentionOnRestart(): RestartTurnMark {
  return {
    state: "uncertain",
    needsAttention: true,
    reason: "process_restart",
    autoRetry: false,
  };
}

export const RESTART_ACTIVE_TURN_STATES = [
  "acquiring",
  "creating",
  "streaming",
  "resuming",
] as const;

/**
 * Reconnect replay must not emit duplicate channel sequences.
 * Keeps first occurrence of each sequence in ascending order.
 */
export function dedupeReplayEnvelopes(envelopes: AgentChannelEnvelope[]): AgentChannelEnvelope[] {
  const seen = new Set<number>();
  const out: AgentChannelEnvelope[] = [];
  const sorted = [...envelopes].sort((a, b) => a.channelSequence - b.channelSequence);
  for (const envelope of sorted) {
    if (seen.has(envelope.channelSequence)) {
      continue;
    }
    seen.add(envelope.channelSequence);
    out.push(envelope);
  }
  return out;
}

/** While a step is cancelling, new remote turns for that session must wait. */
export function blocksNewRemoteTurn(stepState: StoppableStepState): boolean {
  return stepState === "cancelling";
}

export type McpInFlightOutcome =
  { kind: "completed"; honest: true } | { kind: "unknown"; honest: true; needsAttention: true };

/** In-flight MCP after stop: never invent success/failure — render honestly. */
export function renderInFlightMcpOutcome(knownTerminal: boolean): McpInFlightOutcome {
  if (knownTerminal) {
    return { kind: "completed", honest: true };
  }
  return { kind: "unknown", honest: true, needsAttention: true };
}
