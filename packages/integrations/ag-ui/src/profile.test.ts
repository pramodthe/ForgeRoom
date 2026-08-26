import { describe, expect, it } from "vitest";
import { readProviderFixtureJson } from "@forgeroom/test-fixtures";
import {
  AG_UI_PACKAGE_PROFILE,
  SELECTED_AG_UI_VERSIONS,
  assertAgUiStartupProfile,
  isCopilotKitGatewayEnabled,
} from "./profile";

describe("pure_ag_ui_0_0_57 profile", () => {
  it("matches selected provider fixture candidates", () => {
    const candidates = readProviderFixtureJson<{
      status: string;
      requiredPureBaseline: { status: string; packages: Record<string, string> };
      optionalCopilotKitTarget: { status: string; enabled: boolean };
    }>("ag-ui/candidates.json");

    expect(AG_UI_PACKAGE_PROFILE).toBe("pure_ag_ui_0_0_57");
    expect(candidates.status).toBe("selected");
    expect(candidates.requiredPureBaseline.status).toBe("selected");
    expect(candidates.requiredPureBaseline.packages).toEqual(SELECTED_AG_UI_VERSIONS);
    expect(candidates.optionalCopilotKitTarget.status).toBe("candidate");
    expect(candidates.optionalCopilotKitTarget.enabled).toBe(false);
  });

  it("asserts startup profile without throwing", () => {
    expect(isCopilotKitGatewayEnabled()).toBe(false);
    expect(() => assertAgUiStartupProfile()).not.toThrow();
  });
});
