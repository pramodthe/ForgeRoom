import { describe, expect, it } from "vitest";
import { PACKAGE_BOUNDARY, parsePackageBoundary } from "./index";

describe("packageBoundarySchema", () => {
  it("accepts the frozen P0 boundary", () => {
    expect(parsePackageBoundary(PACKAGE_BOUNDARY)).toEqual(PACKAGE_BOUNDARY);
  });

  it("rejects enabling open generated UI", () => {
    expect(() =>
      parsePackageBoundary({
        ...PACKAGE_BOUNDARY,
        openGeneratedUi: "enabled",
      }),
    ).toThrow();
  });
});
