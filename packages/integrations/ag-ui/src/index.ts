export type UnsupportedP0Capability =
  "iframe_v1" | "generate_open_ui" | "native_subagent" | "copilotkit_gateway";

export type UnsupportedCapabilityResult = {
  ok: false;
  capability: UnsupportedP0Capability | string;
  reason: "unsupported_in_p0";
};

export function rejectUnsupportedCapability(capability: string): UnsupportedCapabilityResult {
  return { ok: false, capability, reason: "unsupported_in_p0" };
}

export function isOpenGeneratedUiRuntimeLoaded(): false {
  return false;
}

export {
  AG_UI_PACKAGE_PROFILE,
  AG_UI_PACKAGE_PROFILE as AGUI_PACKAGE_PROFILE,
  SELECTED_AG_UI_VERSIONS,
  assertAgUiStartupProfile,
  isCopilotKitGatewayEnabled,
} from "./profile";

export {
  type AgUiLockfileInspection,
  assertAgUiLockfileSingleResolution,
  inspectAgUiLockfile,
  repoRoot,
} from "./lockfile";

export {
  assertTrueForgeFixtureShape,
  loadTrueForgeStreamFixture,
  parseAgUiSseBody,
  parseTrueForgeStreamFixture,
} from "./stream-parser";
