export const AG_UI_PACKAGE_PROFILE = "unset-pending-P0-210" as const;

export type UnsupportedP0Capability =
  "iframe_v1" | "generate_open_ui" | "native_subagent" | "copilotkit_gateway";

export type UnsupportedCapabilityResult = {
  ok: false;
  capability: UnsupportedP0Capability | string;
  reason: "unsupported_in_p0";
};

/** P0 has no accepted generated-UI or CopilotKit capability. Unknown names fail closed. */
export function rejectUnsupportedCapability(capability: string): UnsupportedCapabilityResult {
  return { ok: false, capability, reason: "unsupported_in_p0" };
}

export function isOpenGeneratedUiRuntimeLoaded(): false {
  return false;
}
