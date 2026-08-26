import { describe, expect, it } from "vitest";
import {
  P0_MAX_ROUTING_RECIPIENTS,
  routingResolutionSchema,
  routingFailureReasonSchema,
} from "./routing";

describe("routing contracts", () => {
  it("caps P0 fan-out at two recipients", () => {
    expect(P0_MAX_ROUTING_RECIPIENTS).toBe(2);
    expect(
      routingResolutionSchema.safeParse({
        ok: true,
        routing_mode: "direct",
        recipient_handles: ["a", "b", "c"],
      }).success,
    ).toBe(false);
    const ok = routingResolutionSchema.parse({
      ok: true,
      routing_mode: "team",
      recipient_handles: ["a", "b"],
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.recipient_handles).toEqual(["a", "b"]);
    }
  });

  it("accepts typed routing failures", () => {
    expect(routingFailureReasonSchema.parse("ambiguous_handle")).toBe("ambiguous_handle");
    const failed = routingResolutionSchema.parse({
      ok: false,
      code: "recipient_required",
      reason: "recipient_required",
      message: "Choose a recipient.",
      details: {},
    });
    expect(failed.ok).toBe(false);
    if (!failed.ok) {
      expect(failed.code).toBe("recipient_required");
    }
  });
});
