export { HostButton, type HostButtonProps } from "./host-button";
export { ComponentHostBoundary, AgUiActivitySlot, ControlledComponentSlot } from "./component-host";
export { LoadingState, ForbiddenState, RouteErrorState, EmptyState } from "./shell-states";

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
