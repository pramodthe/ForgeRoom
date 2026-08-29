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

/**
 * TrueForge exposes MCP tools through OpenAI function tools, whose names cannot
 * contain dots. Keep canonical ForgeRoom names internally and adapt only at the
 * provider-facing MCP boundary.
 */
export function providerSafeMcpToolName(toolName: string): string {
  return toolName.replace(/[^a-zA-Z0-9_-]/g, "_");
}

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
