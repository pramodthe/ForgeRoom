import { createHmac, timingSafeEqual } from "node:crypto";

/** Derive a generation-scoped MCP header secret from the workspace master secret. */
export function deriveUiComponentsMcpSecret(masterSecret: string, generationId: string): string {
  return createHmac("sha256", masterSecret)
    .update(`forgeroom-ui-components-mcp-v1:${generationId}`)
    .digest("hex");
}

export function verifyUiComponentsMcpSecret(
  masterSecret: string,
  generationId: string,
  providedSecret: string,
): boolean {
  const expectedSecret = deriveUiComponentsMcpSecret(masterSecret, generationId);
  const provided = Buffer.from(providedSecret);
  const expected = Buffer.from(expectedSecret);
  if (provided.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(provided, expected);
}
