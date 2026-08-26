import { describe, expect, it } from "vitest";
import { readProviderFixtureJson } from "@forgeroom/test-fixtures";
import { isCopilotKitGatewayEnabled } from "./profile";

describe("CopilotKit gateway policy", () => {
  it("documents and rejects the 1.69.0 split negative control", () => {
    const rejection = readProviderFixtureJson<{
      status: string;
      negativeControl: { package: string; version: string; status: string };
      split: {
        problem: string;
        directRequest: { version: string };
        transitiveRequest: { version: string };
      };
      decision: {
        pureBaseline: { profile: string; status: string };
        copilotKitGateway: { enabled: boolean; route: string; whenDisabled: string };
      };
    }>("ag-ui/copilotkit-split-rejection.json");

    expect(rejection.status).toBe("rejected");
    expect(rejection.negativeControl).toMatchObject({
      package: "@copilotkit/runtime",
      version: "1.69.0",
      status: "rejected",
    });
    expect(rejection.split.directRequest.version).toBe("0.0.57");
    expect(rejection.split.transitiveRequest.version).toBe("0.0.54");
    expect(rejection.decision.pureBaseline.profile).toBe("pure_ag_ui_0_0_57");
    expect(rejection.decision.pureBaseline.status).toBe("selected");
    expect(rejection.decision.copilotKitGateway).toMatchObject({
      enabled: false,
      route: "/api/copilotkit",
      whenDisabled: "404",
    });
  });

  it("keeps the runtime gateway disabled in code", () => {
    expect(isCopilotKitGatewayEnabled()).toBe(false);
  });
});
