import { createHmac } from "node:crypto";

/** Derive a generation-scoped MCP header secret from the workspace master secret. */
export function deriveUiComponentsMcpSecret(masterSecret: string, generationId: string): string {
  return createHmac("sha256", masterSecret)
    .update(`forgeroom-ui-components-mcp-v1:${generationId}`)
    .digest("hex");
}
