const TOOL_LABELS: Record<string, string> = {
  GITHUB_GET_ISSUES: "GitHub read",
  GITHUB_GET_AN_ISSUE: "GitHub read",
  GITHUB_ADD_LABELS_TO_AN_ISSUE: "GitHub labels",
  GITHUB_REMOVE_A_LABEL_FROM_AN_ISSUE: "GitHub labels",
  SUPPORT_SEARCH: "Support search",
  DATATABLE_RENDER: "Tables",
  CHART_RENDER: "Charts",
  INTERCOM_UPDATE_MACRO: "Intercom updates",
  SANDBOX_RUN: "Sandbox",
  TASK_WRITE: "Tasks",
  ARTIFACT_PUBLISH: "Artifacts",
};

export function formatToolLabel(tool: string): string {
  const normalized = tool.trim().toUpperCase();
  const known = TOOL_LABELS[normalized];
  if (known) return known;

  return normalized
    .split("_")
    .filter(Boolean)
    .map((word) => word[0] + word.slice(1).toLowerCase())
    .join(" ");
}

export function toolLabels(tools: readonly string[]): string[] {
  return [...new Set(tools.map(formatToolLabel).filter(Boolean))];
}
