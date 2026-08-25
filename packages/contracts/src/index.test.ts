import { describe, expect, it } from "vitest";
import { PACKAGE_BOUNDARY, parsePackageBoundary } from "./boundary";
import * as runtime from "./index";

describe("packageBoundarySchema", () => {
  it("accepts the frozen P0 boundary", () => {
    expect(parsePackageBoundary(PACKAGE_BOUNDARY)).toEqual(PACKAGE_BOUNDARY);
    expect(PACKAGE_BOUNDARY.upstreamAgUiAdapters).toBe("owned-by-P0-211");
  });

  it("rejects enabling open generated UI or CopilotKit", () => {
    expect(() =>
      parsePackageBoundary({
        ...PACKAGE_BOUNDARY,
        openGeneratedUi: "enabled",
      }),
    ).toThrow();
    expect(() =>
      parsePackageBoundary({
        ...PACKAGE_BOUNDARY,
        copilotKit: "enabled",
      }),
    ).toThrow();
  });
});

describe("P0 runtime export surface", () => {
  it("does not export iframe or open-generated UI wire records", () => {
    const names = Object.keys(runtime);
    expect(names).not.toContain("openGeneratedUiActivityProjectionV1Schema");
    expect(names).not.toContain("generatedSourceEventRefV1Schema");
    expect(names.join(" ")).not.toMatch(/iframe_v1Schema/i);
  });

  it("exposes interpret helpers instead of upstream AG-UI adapters", () => {
    expect(runtime.parseUpstreamAgUiEvent({ type: "TEXT_MESSAGE_START" })).toEqual({
      ok: false,
      capability: "upstream_ag_ui_schema",
      reason: "owned_by_P0-211",
    });
    expect(runtime.parseUpstreamRunAgentInput({})).toEqual({
      ok: false,
      capability: "RunAgentInput",
      reason: "owned_by_P0-211",
    });
  });
});
