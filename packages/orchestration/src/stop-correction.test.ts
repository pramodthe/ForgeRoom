import { describe, expect, it } from "vitest";
import type { AgentChannelEnvelope } from "@forgeroom/contracts";
import {
  blocksNewRemoteTurn,
  buildCorrectionQueueIntent,
  decideStop,
  dedupeReplayEnvelopes,
  markNeedsAttentionOnRestart,
  normalMessageImpliesStop,
  renderInFlightMcpOutcome,
} from "./stop-correction";

describe("stop and correction", () => {
  it("enters cancelling once and does not re-call cancel", () => {
    expect(decideStop("running")).toEqual({ action: "enter_cancelling", callCancel: true });
    expect(decideStop("cancelling")).toEqual({ action: "already_cancelling", callCancel: false });
    expect(decideStop("cancelled")).toEqual({ action: "already_settled", callCancel: false });
  });

  it("never treats a normal message as an implicit stop", () => {
    expect(normalMessageImpliesStop()).toBe(false);
    expect(blocksNewRemoteTurn("cancelling")).toBe(true);
    expect(blocksNewRemoteTurn("running")).toBe(false);
  });

  it("builds a correction linked to the prior step", () => {
    expect(
      buildCorrectionQueueIntent({ priorRunStepId: "step_1", content: "Use label safe instead" }),
    ).toEqual({
      inputType: "correction",
      priorRunStepId: "step_1",
      content: "Use label safe instead",
    });
  });

  it("marks restart work needs_attention without auto-retry", () => {
    expect(markNeedsAttentionOnRestart()).toEqual({
      state: "uncertain",
      needsAttention: true,
      reason: "process_restart",
      autoRetry: false,
    });
  });

  it("dedupes reconnect replay by channel sequence", () => {
    const base = {
      schemaVersion: 1 as const,
      channelId: "ch_1",
      actorKind: "system" as const,
      aguiEvent: { type: "CUSTOM" as const, name: "forgeroom.noop", value: {} },
    };
    const envelopes = [
      { ...base, channelSequence: 2 },
      { ...base, channelSequence: 1 },
      { ...base, channelSequence: 2 },
    ] as unknown as AgentChannelEnvelope[];
    expect(dedupeReplayEnvelopes(envelopes).map((row) => row.channelSequence)).toEqual([1, 2]);
  });

  it("renders in-flight MCP outcomes honestly after stop", () => {
    expect(renderInFlightMcpOutcome(true)).toEqual({ kind: "completed", honest: true });
    expect(renderInFlightMcpOutcome(false)).toEqual({
      kind: "unknown",
      honest: true,
      needsAttention: true,
    });
  });
});
