import { describe, expect, it } from "vitest";
import { formatPauseGroupLifecycleMessage } from "./pause-group-lifecycle";

describe("formatPauseGroupLifecycleMessage", () => {
  it("describes waiting for sibling actions", () => {
    expect(
      formatPauseGroupLifecycleMessage({
        recordedVerb: "decision",
        pauseGroupReady: false,
        pauseGroupState: "collecting",
        requiredActionCount: 2,
        resolvedActionCount: 1,
      }),
    ).toEqual(["Decision recorded.", "1 more required action must resolve before resume."]);
  });

  it("describes a ready pause group", () => {
    expect(
      formatPauseGroupLifecycleMessage({
        recordedVerb: "answer",
        pauseGroupReady: true,
        pauseGroupState: "ready",
        requiredActionCount: 1,
        resolvedActionCount: 1,
      }),
    ).toEqual([
      "Answer recorded.",
      "Pause group ready — resume will start after the worker claims it.",
    ]);
  });
});
