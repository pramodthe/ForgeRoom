/** P0 Composio toolkit slug (at most two apps; demo uses github only). */
export type ComposioToolkitSlug = "github";

/** Exact Phase 0 direct-tool slugs (two to four total). */
export type P0ComposioDirectToolSlug =
  | "GITHUB_GET_AN_ISSUE"
  | "GITHUB_ADD_LABELS_TO_AN_ISSUE"
  | "GITHUB_REMOVE_A_LABEL_FROM_AN_ISSUE";

export type ConnectedAccountsPin = Readonly<
  Record<ComposioToolkitSlug, readonly [string, ...string[]]>
>;

export type ComposioClientOptions = {
  apiKey: string;
  /** Stable workspace service-user ID (COMPOSIO_USER_ID). */
  userId: string;
  /** Exact pinned connected-account ID for the github toolkit. */
  connectedAccountId: string;
  /**
   * Auth config id for Connect Link reconnect (COMPOSIO_AUTH_CONFIG_ID).
   * Required only for reconnect; status/test work without it.
   */
  authConfigId?: string;
  /** Default: https://backend.composio.dev */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

/**
 * Hosted MCP transport secrets. Never log, persist in DB JSON, or return to browsers.
 * Callers must keep these in the server secret store / process memory only.
 */
export type ComposioMcpSecrets = {
  type: "http";
  url: string;
  headers: Readonly<Record<string, string>>;
};

export type ComposioSessionConfigSnapshot = {
  userId: string;
  toolkits: { enabled: string[] };
  tools: Record<string, { enabled: string[] }>;
  connectedAccounts: Record<string, string[]>;
  manageConnections: { enabled: boolean };
  workbench: { enable: boolean };
  multiAccount: { enable: boolean };
  search: { enable: boolean };
  execute: { enableMultiExecute: boolean };
  preloadTools: string[];
};

export type ComposioHostedSession = {
  sessionId: string;
  tools: readonly string[];
  config: ComposioSessionConfigSnapshot;
  configVersion: number;
  /** Opaque MCP credentials — treat as secrets. */
  mcp: ComposioMcpSecrets;
};

/** Safe, redacted evidence suitable for task notes / fixtures (no secrets). */
export type ComposioSessionRedactedEvidence = {
  sessionId: string;
  userId: string;
  toolkitSlugs: string[];
  tools: string[];
  connectedAccountSuffixes: Record<string, string>;
  mcpUrlHost: string;
  mcpUrlPathPrefix: string;
  manageConnectionsEnabled: boolean;
  workbenchEnabled: boolean;
  multiAccountEnabled: boolean;
  searchEnabled: boolean;
  multiExecuteEnabled: boolean;
  forbiddenSurfacesPresent: string[];
};
