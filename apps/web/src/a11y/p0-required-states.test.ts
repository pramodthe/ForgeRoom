import { describe, expect, it } from "vitest";
import { listP0RequiredStateKeys, P0_REQUIRED_STATE_SURFACES } from "./p0-required-states";

describe("P0 required state coverage registry", () => {
  it("lists every documented surface without duplicates", () => {
    const keys = listP0RequiredStateKeys();
    expect(keys.length).toBeGreaterThanOrEqual(10);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(P0_REQUIRED_STATE_SURFACES[key].length).toBeGreaterThan(0);
    }
  });
});
