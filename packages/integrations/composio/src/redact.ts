import type { ComposioHostedSession, ComposioSessionRedactedEvidence } from "./types";

export function redactConnectedAccountId(id: string): string {
  const trimmed = id.trim();
  if (trimmed.length < 4) {
    return "****";
  }
  return trimmed.slice(-4);
}

export function redactMcpUrl(url: string): { host: string; pathPrefix: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { host: "invalid", pathPrefix: "/" };
  }
  const parts = parsed.pathname.split("/").filter(Boolean);
  // Keep /tool_router/<sessionId>/mcp shape without query secrets.
  const pathPrefix =
    parts.length >= 1 ? `/${parts.slice(0, Math.min(parts.length, 3)).join("/")}` : "/";
  return { host: parsed.host, pathPrefix };
}

/**
 * Build fixture-safe evidence. Never includes API keys, MCP headers, or full account IDs.
 */
export function toRedactedSessionEvidence(
  session: ComposioHostedSession,
): ComposioSessionRedactedEvidence {
  const { host, pathPrefix } = redactMcpUrl(session.mcp.url);
  const connectedAccountSuffixes: Record<string, string> = {};
  for (const [toolkit, ids] of Object.entries(session.config.connectedAccounts)) {
    connectedAccountSuffixes[toolkit] = ids.map(redactConnectedAccountId).join(",");
  }

  return {
    sessionId: session.sessionId,
    userId: session.config.userId,
    toolkitSlugs: session.config.toolkits.enabled,
    tools: [...session.tools].sort(),
    connectedAccountSuffixes,
    mcpUrlHost: host,
    mcpUrlPathPrefix: pathPrefix,
    manageConnectionsEnabled: session.config.manageConnections.enabled,
    workbenchEnabled: session.config.workbench.enable,
    multiAccountEnabled: session.config.multiAccount.enable,
    searchEnabled: session.config.search.enable,
    multiExecuteEnabled: session.config.execute.enableMultiExecute,
    forbiddenSurfacesPresent: [],
  };
}
