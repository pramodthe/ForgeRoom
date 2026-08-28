import { P0_COMPOSIO_DIRECT_TOOLS } from "@forgeroom/composio";

/** Frozen P0 workspace policy revision bound at confirm time. */
export const P0_COWORKER_POLICY_REVISION = 1;

/** Frozen P0 Composio/tool catalogue revision bound at confirm time. */
export const P0_COWORKER_CATALOG_REVISION = 1;

/** Draft proposals expire after 24 hours unless revised. */
export const COWORKER_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export const GOLDEN_RESEARCH_PROMPT =
  "Create a Research coworker that can read GitHub and web data but cannot modify anything.";

export const RESEARCH_READ_TOOL_SLUG = "GITHUB_GET_AN_ISSUE" as const;

export const P0_WRITE_TOOL_DENIALS = [
  "GITHUB_ADD_LABELS_TO_AN_ISSUE",
  "GITHUB_REMOVE_A_LABEL_FROM_AN_ISSUE",
] as const satisfies ReadonlyArray<(typeof P0_COMPOSIO_DIRECT_TOOLS)[number]>;

export const WORKSPACE_SERVICE_ACCOUNT_LABEL = "Workspace service account (pinned GitHub)";
