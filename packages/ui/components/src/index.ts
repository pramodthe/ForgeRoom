export { HostButton, type HostButtonProps } from "./host-button";

export const CONTROLLED_COMPONENT_RAIL = "registered_react" as const;
export const OPEN_GENERATED_UI_RAIL = "disabled" as const;

export type ComponentExposure = "agent_tool" | "server_only";

export function describeControlledUiBoundary(): {
  rail: typeof CONTROLLED_COMPONENT_RAIL;
  openGeneratedUi: typeof OPEN_GENERATED_UI_RAIL;
} {
  return {
    rail: CONTROLLED_COMPONENT_RAIL,
    openGeneratedUi: OPEN_GENERATED_UI_RAIL,
  };
}
