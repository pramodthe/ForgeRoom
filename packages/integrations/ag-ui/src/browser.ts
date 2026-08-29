/**
 * Browser-safe entry for `@forgeroom/ag-ui`.
 * Do not re-export lockfile/profile/stream-parser/adapter (Node / fixtures / postgres).
 */
export { HttpAgent, type AgentSubscriber, type RunAgentParameters } from "@ag-ui/client";
export { buildLogicalAguiThreadId } from "./logical-thread";
export {
  initialUiPresentationState,
  reduceUiPresentationState,
  type UiPresentationState,
} from "./ui-state-reducer";
export {
  initialActivityPresentationState,
  reduceActivityPresentationState,
  type ActivityEntry,
  type ActivityLaneOwner,
  type ActivityPresentationState,
} from "./activity-reducer";
export {
  initialToolCallPresentationState,
  reduceToolCallPresentationState,
  type ToolCallEntry,
  type ToolCallPresentationState,
} from "./tool-call-reducer";
export { compactChannelEnvelopes, isMessagesSnapshotEvent } from "./messages-compaction";
