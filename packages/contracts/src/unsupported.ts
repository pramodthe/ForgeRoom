export type UnsupportedCapabilityReason = "unsupported_in_p0" | "owned_by_P0-211";

export type UnsupportedCapabilityResult = {
  ok: false;
  capability: string;
  reason: UnsupportedCapabilityReason;
};

export const P0_UNSUPPORTED_CAPABILITIES = [
  "iframe_v1",
  "generate_open_ui",
  "open-generative-ui",
  "open_generated_ui",
  "native_subagent",
  "subagent.started",
  "subagent.completed",
  "subagent.failed",
  "copilotkit_gateway",
  "request_agent_turn",
  "open_existing_hitl",
  "GeneratedSourceEventRefV1",
] as const;

export type P0UnsupportedCapability = (typeof P0_UNSUPPORTED_CAPABILITIES)[number];

const unsupported = new Set<string>(P0_UNSUPPORTED_CAPABILITIES);

export function isP0UnsupportedCapability(capability: string): boolean {
  return (
    unsupported.has(capability) ||
    capability.startsWith("iframe_") ||
    capability.includes("open_ui") ||
    capability.includes("open-generative") ||
    capability.startsWith("subagent.") ||
    capability.startsWith("SUBAGENT_") ||
    capability.startsWith("REASONING_") ||
    capability.startsWith("THINKING_") ||
    capability === "RAW"
  );
}

export function unsupportedCapability(
  capability: string,
  reason: UnsupportedCapabilityReason = "unsupported_in_p0",
): UnsupportedCapabilityResult {
  return { ok: false, capability, reason };
}

export function interpretP0Capability(
  capability: string,
): { ok: true; capability: string } | UnsupportedCapabilityResult {
  if (isP0UnsupportedCapability(capability)) {
    return unsupportedCapability(capability);
  }
  return { ok: true, capability };
}
