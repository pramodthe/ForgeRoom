import {
  listAgentToolDefinitions,
  componentToolName,
  stableNameFromComponentToolName,
} from "@forgeroom/domain";

export type UiComponentsMcpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export function listControlledComponentMcpTools(
  enabledToolNames?: readonly string[],
): UiComponentsMcpTool[] {
  const enabled = enabledToolNames ? new Set(enabledToolNames) : null;
  return listAgentToolDefinitions()
    .map((definition) => ({
      name: componentToolName(definition.name),
      description: definition.modelDescription,
      inputSchema: definition.parameterSchema as Record<string, unknown>,
    }))
    .filter((tool) => (enabled ? enabled.has(tool.name) : true))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function resolveStableNameForMcpTool(toolName: string): string | null {
  return stableNameFromComponentToolName(toolName);
}
