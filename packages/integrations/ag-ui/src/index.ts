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

export { buildLogicalAguiThreadId } from "./logical-thread";
export { buildForgeRoomEventMetadata, type ForgeRoomEventMetadataV1 } from "./metadata";
export {
  extractLatestUserMessageContent,
  extractExistingRunBinding,
  parseUpstreamAgUiEvent,
  parseUpstreamRunAgentInput,
  type ParsedAgUiEvent,
  type ParsedRunAgentInput,
  type UpstreamParseFailure,
  type ExistingRunBinding,
} from "./upstream";
export { toPersistedAgUiEvent } from "./persisted";
export {
  initialUiPresentationState,
  reduceUiPresentationState,
  type UiPresentationState,
} from "./ui-state-reducer";
export {
  initialActivityPresentationState,
  reduceActivityPresentationState,
  type ActivityPresentationState,
} from "./activity-reducer";
export { compactChannelEnvelopes, isMessagesSnapshotEvent } from "./messages-compaction";
export { HttpAgent, type AgentSubscriber, type RunAgentParameters } from "@ag-ui/client";
export { formatAgUiSseBody, formatAgUiSseEvent } from "./sse";
export { buildAgUiCoworkerCapabilities, type AgUiCoworkerCapabilities } from "./capabilities";
export {
  pollTrueForgeTurnEvents,
  TrueForgeAGUIAdapter,
  type TrueForgeAdapterContext,
} from "./adapter";
