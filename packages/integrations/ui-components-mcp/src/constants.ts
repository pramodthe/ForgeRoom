/** TrueForge MCP connector name prefix for controlled registry component tools. */
export const P0_UI_COMPONENTS_MCP_CONNECTOR_PREFIX = "ui_components_v1" as const;

/** Legacy single-connector name retained for tests and backward-compatible references. */
export const P0_UI_COMPONENTS_MCP_CONNECTOR_NAME = P0_UI_COMPONENTS_MCP_CONNECTOR_PREFIX;

export const P0_UI_COMPONENTS_MCP_HEADER_NAME = "x-forgeroom-ui-components-mcp-key" as const;

export function buildUiComponentsMcpConnectorName(generationId: string): string {
  return `${P0_UI_COMPONENTS_MCP_CONNECTOR_PREFIX}__${generationId}`;
}

export function buildUiComponentsMcpSessionUrl(appOrigin: string, generationId: string): string {
  const base = appOrigin.replace(/\/$/, "");
  return `${base}/api/mcp/ui_components_v1/sessions/${encodeURIComponent(generationId)}`;
}
