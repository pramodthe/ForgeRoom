import type { AgentChannelEnvelope } from "@forgeroom/contracts";

/**
 * Advance the SSE delivery cursor through `throughSequence`.
 * Emits any pending valid envelopes in order; sequences with no pending
 * envelope are treated as skipped/unparseable and advance the watermark
 * without emission so later events are not stalled forever.
 */
export function drainThroughSequence(
  lastSent: number,
  throughSequence: number,
  pending: Map<number, AgentChannelEnvelope>,
): { lastSent: number; toEmit: AgentChannelEnvelope[] } {
  let cursor = lastSent;
  const toEmit: AgentChannelEnvelope[] = [];
  while (cursor < throughSequence) {
    const next = cursor + 1;
    const envelope = pending.get(next);
    if (envelope) {
      pending.delete(next);
      toEmit.push(envelope);
    }
    cursor = next;
  }
  return { lastSent: cursor, toEmit };
}
