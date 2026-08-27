import { describe, expect, it } from "vitest";
import {
  compareClaimOrder,
  evaluateClaimEligibility,
  priorityForInputType,
  resolveClaimGenerationBinding,
} from "./turn-queue";

describe("turn queue priorities", () => {
  it("ranks pause responses above component responses above normals", () => {
    expect(priorityForInputType("pause_group_response")).toBeGreaterThan(
      priorityForInputType("component_interaction_response"),
    );
    expect(priorityForInputType("component_interaction_response")).toBeGreaterThan(
      priorityForInputType("normal"),
    );
  });

  it("orders claims by priority then FIFO", () => {
    const items = [
      { priority: priorityForInputType("normal"), fifoSequence: 2 },
      { priority: priorityForInputType("pause_group_response"), fifoSequence: 5 },
      { priority: priorityForInputType("component_interaction_response"), fifoSequence: 1 },
      { priority: priorityForInputType("normal"), fifoSequence: 0 },
    ];
    const sorted = [...items].sort(compareClaimOrder);
    expect(sorted.map((row) => row.fifoSequence)).toEqual([5, 1, 0, 2]);
  });
});

describe("claim eligibility", () => {
  it("blocks rotating, disabled, and busy sessions", () => {
    expect(evaluateClaimEligibility({ sessionState: "rotating", hasRemoteActiveTurn: false })).toEqual({
      ok: false,
      reason: "session_rotating",
    });
    expect(evaluateClaimEligibility({ sessionState: "disabled", hasRemoteActiveTurn: false })).toEqual({
      ok: false,
      reason: "session_disabled",
    });
    expect(evaluateClaimEligibility({ sessionState: "active", hasRemoteActiveTurn: true })).toEqual({
      ok: false,
      reason: "session_busy",
    });
    expect(evaluateClaimEligibility({ sessionState: "active", hasRemoteActiveTurn: false })).toEqual({
      ok: true,
    });
  });
});

describe("generation binding on claim", () => {
  it("binds normals to the current generation and never rebinds responses", () => {
    expect(
      resolveClaimGenerationBinding({
        inputType: "normal",
        boundGenerationId: null,
        currentGenerationId: "gen_2",
      }),
    ).toEqual({ ok: true, boundGenerationId: "gen_2" });

    expect(
      resolveClaimGenerationBinding({
        inputType: "component_interaction_response",
        boundGenerationId: "gen_1",
        currentGenerationId: "gen_2",
      }),
    ).toEqual({ ok: false, reason: "stale_generation" });

    expect(
      resolveClaimGenerationBinding({
        inputType: "pause_group_response",
        boundGenerationId: "gen_2",
        currentGenerationId: "gen_2",
      }),
    ).toEqual({ ok: true, boundGenerationId: "gen_2" });
  });
});
