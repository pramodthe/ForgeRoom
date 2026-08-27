import type { P0ComposioDirectToolSlug } from "./types";

/**
 * Frozen P0 Composio direct-tools contract (ADR-003 / OD-002 / OD-003).
 * Exact slugs match provider-fixtures/composio/tools.candidate.json.
 */
export const P0_COMPOSIO_TOOLKIT = "github" as const;

export const P0_COMPOSIO_DIRECT_TOOLS = [
  "GITHUB_GET_AN_ISSUE",
  "GITHUB_ADD_LABELS_TO_AN_ISSUE",
  "GITHUB_REMOVE_A_LABEL_FROM_AN_ISSUE",
] as const satisfies readonly P0ComposioDirectToolSlug[];

/** Surfaces that must never appear on a P0 hosted MCP session tool list. */
export const P0_COMPOSIO_FORBIDDEN_SURFACES = [
  "COMPOSIO_SEARCH_TOOLS",
  "COMPOSIO_MULTI_EXECUTE_TOOL",
  "COMPOSIO_REMOTE_WORKBENCH",
  "COMPOSIO_REMOTE_BASH_TOOL",
  "COMPOSIO_MANAGE_CONNECTIONS",
  "COMPOSIO_WAIT_FOR_CONNECTIONS",
] as const;

export const P0_COMPOSIO_MAX_TOOLKITS = 2;
export const P0_COMPOSIO_MIN_TOOLS = 2;
export const P0_COMPOSIO_MAX_TOOLS = 4;

export function assertP0ToolCount(tools: readonly string[]): void {
  if (tools.length < P0_COMPOSIO_MIN_TOOLS || tools.length > P0_COMPOSIO_MAX_TOOLS) {
    throw new Error(
      `P0 Composio session must expose ${P0_COMPOSIO_MIN_TOOLS}–${P0_COMPOSIO_MAX_TOOLS} tools; got ${tools.length}`,
    );
  }
}

export function findForbiddenSurfaces(tools: readonly string[]): string[] {
  const set = new Set(tools);
  return P0_COMPOSIO_FORBIDDEN_SURFACES.filter((slug) => set.has(slug));
}
