export { HostButton, type HostButtonProps } from "./host-button";
export { ComponentHostBoundary, AgUiActivitySlot, ControlledComponentSlot } from "./component-host";
export { LoadingState, ForbiddenState, RouteErrorState, EmptyState } from "./shell-states";
export {
  ControlledInstance,
  type ControlledInstanceData,
  type ControlledInstanceProps,
} from "./controlled/controlled-instance";
export {
  ControlledArtifactCard,
  ControlledBarOrLineChart,
  ControlledChoiceForm,
  ControlledDataTable,
  ControlledTaskCard,
} from "./controlled/renderers";
export { validateControlledProps, type PropValidationResult } from "./controlled/validate-props";
export {
  ActivityCardShell,
  CustomEventActivityCard,
  ForgeRoomActivityCard,
  InertUnknownActivityCard,
  InertUnsupportedActivityCard,
  RunCountersFooter,
  activityIconForEyebrow,
  formatRunActivityCounters,
  presentCustomEvent,
  presentForgeRoomActivity,
  presentUnsupportedCapability,
  presentUnknownActivity,
  type ActivityCardShellProps,
  type ActivityCardTone,
  type CustomEventActivityCardProps,
  type ForgeRoomActivityCardProps,
  type ApplicationSourceName,
} from "./activity-cards";

export const CONTROLLED_COMPONENT_RAIL = "registered_react" as const;
export const OPEN_GENERATED_UI_RAIL = "disabled" as const;
export const P0_REGISTRY_VERSION = "registry-1" as const;

/** Eagerly sorted stable names — grant changes must not reorder React hook registration. */
export const P0_CONTROLLED_COMPONENT_NAMES = [
  "ApprovalCard",
  "ArtifactCard",
  "BarOrLineChart",
  "ChoiceForm",
  "ConnectionCard",
  "DataTable",
  "RequiredQuestionCard",
  "TaskCard",
] as const;

export const P0_AGENT_TOOL_COMPONENT_NAMES = [
  "ArtifactCard",
  "BarOrLineChart",
  "ChoiceForm",
  "DataTable",
  "TaskCard",
] as const;

export type ComponentExposure = "agent_tool" | "server_only";

export function describeControlledUiBoundary(): {
  rail: typeof CONTROLLED_COMPONENT_RAIL;
  openGeneratedUi: typeof OPEN_GENERATED_UI_RAIL;
  registryVersion: typeof P0_REGISTRY_VERSION;
  componentNames: typeof P0_CONTROLLED_COMPONENT_NAMES;
} {
  return {
    rail: CONTROLLED_COMPONENT_RAIL,
    openGeneratedUi: OPEN_GENERATED_UI_RAIL,
    registryVersion: P0_REGISTRY_VERSION,
    componentNames: P0_CONTROLLED_COMPONENT_NAMES,
  };
}
