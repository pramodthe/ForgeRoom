import { readProviderFixtureJson } from "@forgeroom/test-fixtures";
import { assertAgUiLockfileSingleResolution } from "./lockfile";

export const AG_UI_PACKAGE_PROFILE = "pure_ag_ui_0_0_57" as const;

export const SELECTED_AG_UI_VERSIONS = {
  "@ag-ui/core": "0.0.57",
  "@ag-ui/client": "0.0.57",
} as const;

export function isCopilotKitGatewayEnabled(): false {
  return false;
}

export function assertAgUiStartupProfile(): void {
  if (AG_UI_PACKAGE_PROFILE !== "pure_ag_ui_0_0_57") {
    throw new Error(`unsupported AG-UI package profile: ${AG_UI_PACKAGE_PROFILE}`);
  }

  const candidates = readProviderFixtureJson<{
    status: string;
    requiredPureBaseline: { status: string; packages: Record<string, string> };
    optionalCopilotKitTarget: { enabled: boolean };
  }>("ag-ui/candidates.json");
  if (candidates.status !== "selected")
    throw new Error("AG-UI candidates.json top-level status must be selected");
  if (candidates.requiredPureBaseline.status !== "selected")
    throw new Error("requiredPureBaseline.status must be selected");
  for (const [pkg, version] of Object.entries(SELECTED_AG_UI_VERSIONS)) {
    if (candidates.requiredPureBaseline.packages[pkg] !== version)
      throw new Error(`${pkg} candidate version must be ${version}`);
  }
  if (candidates.optionalCopilotKitTarget.enabled)
    throw new Error("optional CopilotKit gateway must remain disabled in P0");

  const rejection = readProviderFixtureJson<{
    status: string;
    negativeControl: { status: string };
    decision: { copilotKitGateway: { enabled: boolean } };
  }>("ag-ui/copilotkit-split-rejection.json");
  if (rejection.status !== "rejected")
    throw new Error("CopilotKit split negative control must be rejected");
  if (rejection.negativeControl.status !== "rejected")
    throw new Error("@copilotkit/runtime@1.69.0 negative control must be rejected");
  if (rejection.decision.copilotKitGateway.enabled)
    throw new Error("CopilotKit gateway must stay disabled until parity graph passes");

  assertAgUiLockfileSingleResolution();
}
