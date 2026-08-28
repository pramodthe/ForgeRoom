/** Stable registry name → TrueForge tool advertisement (e.g. DataTable → ui.dataTable). */
export function componentToolName(stableName: string): string {
  if (stableName.length === 0) {
    return "ui.";
  }
  return `ui.${stableName.charAt(0).toLowerCase()}${stableName.slice(1)}`;
}

export function stableNameFromComponentToolName(toolName: string): string | null {
  if (!toolName.startsWith("ui.") || toolName.length <= 3) {
    return null;
  }
  const suffix = toolName.slice(3);
  if (suffix.length === 0) {
    return null;
  }
  return `${suffix.charAt(0).toUpperCase()}${suffix.slice(1)}`;
}
