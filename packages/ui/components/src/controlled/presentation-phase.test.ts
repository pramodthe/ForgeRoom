import { describe, expect, it } from "vitest";
import { resolveControlledPresentationPhase } from "./presentation-phase";

describe("resolveControlledPresentationPhase", () => {
  it("prefers streaming over preparing when props are not ready", () => {
    expect(
      resolveControlledPresentationPhase({
        status: "building",
        validatedProps: null,
        streaming: true,
      }),
    ).toBe("streaming");
  });

  it("marks ChoiceForm-ready surfaces as waiting when input is required", () => {
    expect(
      resolveControlledPresentationPhase({
        status: "ready",
        validatedProps: { title: "Filter" },
        waitingForInput: true,
      }),
    ).toBe("waiting");
  });

  it("maps invalid props to incompatible", () => {
    expect(
      resolveControlledPresentationPhase({
        status: "ready",
        validatedProps: { title: "Filter" },
        incompatibleReason: "Unknown prop: injected",
      }),
    ).toBe("incompatible");
  });

  it("maps degraded replay to stale", () => {
    expect(
      resolveControlledPresentationPhase({
        status: "degraded",
        validatedProps: { caption: "Rows" },
      }),
    ).toBe("stale");
  });
});
