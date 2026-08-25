import { describe, expect, it } from "vitest";
import {
  AG_UI_PACKAGE_PROFILE,
  isOpenGeneratedUiRuntimeLoaded,
  rejectUnsupportedCapability,
} from "./index";

describe("AG-UI P0 boundary", () => {
  it("does not select a package graph before P0-210", () => {
    expect(AG_UI_PACKAGE_PROFILE).toBe("unset-pending-P0-210");
    expect(isOpenGeneratedUiRuntimeLoaded()).toBe(false);
  });

  it("fails closed on iframe and open-generated UI capabilities", () => {
    expect(rejectUnsupportedCapability("iframe_v1")).toEqual({
      ok: false,
      capability: "iframe_v1",
      reason: "unsupported_in_p0",
    });
    expect(rejectUnsupportedCapability("generate_open_ui").ok).toBe(false);
  });
});
