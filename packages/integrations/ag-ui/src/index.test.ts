import { describe, expect, it } from "vitest";
import {
  AG_UI_PACKAGE_PROFILE,
  SELECTED_AG_UI_VERSIONS,
  assertAgUiStartupProfile,
  isCopilotKitGatewayEnabled,
  isOpenGeneratedUiRuntimeLoaded,
  rejectUnsupportedCapability,
} from "./index";

describe("AG-UI P0 boundary", () => {
  it("selects the pure AG-UI 0.0.57 profile", () => {
    expect(AG_UI_PACKAGE_PROFILE).toBe("pure_ag_ui_0_0_57");
    expect(SELECTED_AG_UI_VERSIONS).toEqual({
      "@ag-ui/core": "0.0.57",
      "@ag-ui/client": "0.0.57",
    });
    expect(isCopilotKitGatewayEnabled()).toBe(false);
    expect(isOpenGeneratedUiRuntimeLoaded()).toBe(false);
  });

  it("fails closed on iframe and open-generated UI capabilities", () => {
    expect(rejectUnsupportedCapability("iframe_v1")).toEqual({
      ok: false,
      capability: "iframe_v1",
      reason: "unsupported_in_p0",
    });
    expect(rejectUnsupportedCapability("generate_open_ui").ok).toBe(false);
    expect(rejectUnsupportedCapability("copilotkit_gateway").ok).toBe(false);
  });

  it("passes startup profile checks against selected fixtures and lockfile", () => {
    expect(() => assertAgUiStartupProfile()).not.toThrow();
  });
});
