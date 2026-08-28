/** Stable registry name → TrueForge tool advertisement (e.g. DataTable → ui.dataTable). */
export function componentToolName(stableName: string): string {
  if (stableName.length === 0) {
    return "ui.";
  }
  return `ui.${stableName.charAt(0).toLowerCase()}${stableName.slice(1)}`;
}
