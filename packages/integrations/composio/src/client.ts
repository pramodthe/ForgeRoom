import { hashComposioToolDescriptorBody, type ObservedToolDescriptor } from "./descriptors";
import {
  assertP0ToolCount,
  findForbiddenSurfaces,
  P0_COMPOSIO_DIRECT_TOOLS,
  P0_COMPOSIO_FORBIDDEN_SURFACES,
  P0_COMPOSIO_TOOLKIT,
} from "./p0-contract";
import type { ConnectedAccountHealth } from "./manifest-verification";
import { isComposioAuthFailure } from "./real-read";
import { parseGrantedScopes } from "./connections";
import { toRedactedSessionEvidence } from "./redact";
import type {
  ComposioClientOptions,
  ComposioHostedSession,
  ComposioMcpSecrets,
  ComposioSessionConfigSnapshot,
  ComposioSessionRedactedEvidence,
} from "./types";

const DEFAULT_BASE_URL = "https://backend.composio.dev";

type RawSessionResponse = {
  session_id?: string;
  mcp?: { type?: string; url?: string; headers?: Record<string, string> };
  tool_router_tools?: string[];
  config?: Record<string, unknown>;
  config_version?: number;
};

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseConfigSnapshot(
  raw: Record<string, unknown>,
  fallbackUserId: string,
  _fallbackAccountId: string,
): ComposioSessionConfigSnapshot {
  const toolkitsRaw = asRecord(raw.toolkits);
  const toolsRaw = asRecord(raw.tools);
  const githubTools = asRecord(toolsRaw.github);
  const manage = asRecord(raw.manage_connections);
  const workbench = asRecord(raw.workbench);
  const multiAccount = asRecord(raw.multi_account);
  const search = asRecord(raw.search);
  const execute = asRecord(raw.execute);
  const preload = asRecord(raw.preload);
  const connected = asRecord(raw.connected_accounts);

  const enabledToolkits = asStringArray(toolkitsRaw.enabled);
  const enabledGithubTools = asStringArray(githubTools.enabled);
  const connectedGithub = asStringArray(connected.github);

  return {
    userId: typeof raw.user_id === "string" ? raw.user_id : fallbackUserId,
    toolkits: {
      // Fail closed: never invent expected toolkit values when the provider omitted them.
      enabled: enabledToolkits,
    },
    tools: {
      github: {
        enabled: enabledGithubTools,
      },
    },
    connectedAccounts: {
      github: connectedGithub,
    },
    manageConnections: {
      enabled: manage.enabled === true || manage.enable === true,
    },
    workbench: {
      enable: workbench.enable === true,
    },
    multiAccount: {
      enable: multiAccount.enable === true,
    },
    search: {
      enable: search.enable === true,
    },
    execute: {
      enableMultiExecute: execute.enable_multi_execute === true,
    },
    preloadTools: asStringArray(preload.tools),
  };
}

function buildCreateSessionBody(input: {
  userId: string;
  connectedAccountId: string;
}): Record<string, unknown> {
  return {
    user_id: input.userId,
    toolkits: { enable: [P0_COMPOSIO_TOOLKIT] },
    connected_accounts: {
      [P0_COMPOSIO_TOOLKIT]: [input.connectedAccountId],
    },
    tools: {
      [P0_COMPOSIO_TOOLKIT]: {
        enable: [...P0_COMPOSIO_DIRECT_TOOLS],
      },
    },
    manage_connections: { enable: false },
    workbench: { enable: false },
    multi_account: { enable: false },
    search: { enable: false },
    execute: { enable_multi_execute: false },
    preload: {
      tools: [...P0_COMPOSIO_DIRECT_TOOLS],
    },
  };
}

function assertP0SessionInvariants(session: ComposioHostedSession): void {
  const forbidden = findForbiddenSurfaces(session.tools);
  if (forbidden.length > 0) {
    throw new Error(`P0 Composio session exposed forbidden surfaces: ${forbidden.join(", ")}`);
  }

  assertP0ToolCount(session.tools);

  if (session.config.toolkits.enabled.length === 0) {
    throw new Error("P0 Composio session must enable at least one toolkit");
  }
  if (session.config.toolkits.enabled.length > 2) {
    throw new Error("P0 Composio session must use at most two toolkits");
  }
  if (!session.config.toolkits.enabled.includes(P0_COMPOSIO_TOOLKIT)) {
    throw new Error(`P0 Composio session must enable toolkit ${P0_COMPOSIO_TOOLKIT}`);
  }

  const pinned = session.config.connectedAccounts.github ?? [];
  if (pinned.length !== 1) {
    throw new Error(
      "P0 Composio session must pin exactly one github connected account (no multi-account fallback)",
    );
  }

  if (session.config.manageConnections.enabled) {
    throw new Error("P0 Composio session must disable manage_connections");
  }
  if (session.config.workbench.enable) {
    throw new Error("P0 Composio session must disable workbench/sandbox");
  }
  if (session.config.multiAccount.enable) {
    throw new Error("P0 Composio session must disable multi_account");
  }
  if (session.config.search.enable) {
    throw new Error("P0 Composio session must disable dynamic write/search meta tools");
  }
  if (session.config.execute.enableMultiExecute) {
    throw new Error("P0 Composio session must disable multi-execute");
  }

  const expected = new Set<string>(P0_COMPOSIO_DIRECT_TOOLS);
  for (const tool of session.tools) {
    if (!expected.has(tool)) {
      throw new Error(`P0 Composio session exposed unexpected tool: ${tool}`);
    }
  }
  for (const required of P0_COMPOSIO_DIRECT_TOOLS) {
    if (!session.tools.includes(required)) {
      throw new Error(`P0 Composio session missing required tool: ${required}`);
    }
  }
}

/**
 * Creates and inspects Composio hosted MCP sessions for the P0 direct-tools contract.
 * MCP URL/headers stay on the returned secrets object only — never write them to git or DB JSON.
 */
export class ComposioSessionClient {
  readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly userId: string;
  private readonly connectedAccountId: string;
  private readonly authConfigId: string | null;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ComposioClientOptions) {
    if (!options.apiKey.trim()) {
      throw new Error("COMPOSIO_API_KEY is required");
    }
    if (!options.userId.trim()) {
      throw new Error("COMPOSIO_USER_ID is required (stable workspace service-user)");
    }
    if (!options.connectedAccountId.trim()) {
      throw new Error("COMPOSIO_CONNECTED_ACCOUNT_ID is required");
    }
    this.apiKey = options.apiKey.trim();
    this.userId = options.userId.trim();
    this.connectedAccountId = options.connectedAccountId.trim();
    this.authConfigId = options.authConfigId?.trim() || null;
    this.baseUrl = trimTrailingSlash(
      (options.baseUrl ?? DEFAULT_BASE_URL).trim() || DEFAULT_BASE_URL,
    );
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get pinnedConnectedAccountId(): string {
    return this.connectedAccountId;
  }

  get composioUserId(): string {
    return this.userId;
  }

  /** Build server-side MCP headers from the API key (never log). */
  buildMcpSecrets(url: string, responseHeaders?: Record<string, string>): ComposioMcpSecrets {
    const headers: Record<string, string> = {
      ...(responseHeaders ?? {}),
      // Trusted credential always wins over any provider-supplied header.
      "x-api-key": this.apiKey,
    };
    return {
      type: "http",
      url,
      headers: Object.freeze({ ...headers }),
    };
  }

  async createDirectToolsSession(): Promise<ComposioHostedSession> {
    const payload = await this.request<RawSessionResponse>(
      "POST",
      "/api/v3.1/tool_router/session",
      buildCreateSessionBody({
        userId: this.userId,
        connectedAccountId: this.connectedAccountId,
      }),
    );
    const session = this.unwrapSession(payload);
    assertP0SessionInvariants(session);
    return session;
  }

  async getSession(sessionId: string): Promise<ComposioHostedSession> {
    const payload = await this.request<RawSessionResponse>(
      "GET",
      `/api/v3.1/tool_router/session/${encodeURIComponent(sessionId)}`,
    );
    const session = this.unwrapSession(payload);
    assertP0SessionInvariants(session);
    return session;
  }

  /** Redacted probe evidence: tools present, forbidden surfaces absent, account suffix only. */
  async probeDirectToolsSession(): Promise<{
    session: ComposioHostedSession;
    evidence: ComposioSessionRedactedEvidence;
  }> {
    const session = await this.createDirectToolsSession();
    const evidence: ComposioSessionRedactedEvidence = {
      ...toRedactedSessionEvidence(session),
      forbiddenSurfacesPresent: findForbiddenSurfaces(session.tools),
    };
    return { session, evidence };
  }

  /**
   * Fetch a tool descriptor body and hash it the same way as the checked-in
   * `provider-fixtures/composio/descriptors/manifest.json` digests
   * (sha256 of raw GET /api/v3.1/tools/{slug} response text).
   */
  async getToolDescriptor(toolSlug: string): Promise<ObservedToolDescriptor> {
    const body = await this.requestText("GET", `/api/v3.1/tools/${encodeURIComponent(toolSlug)}`);
    return {
      toolSlug,
      body,
      sha256: hashComposioToolDescriptorBody(body),
    };
  }

  async listP0ToolDescriptors(): Promise<ObservedToolDescriptor[]> {
    const descriptors: ObservedToolDescriptor[] = [];
    for (const slug of P0_COMPOSIO_DIRECT_TOOLS) {
      descriptors.push(await this.getToolDescriptor(slug));
    }
    return descriptors;
  }

  /** Exact pinned connected-account status (ACTIVE required for dispatch). */
  async getConnectedAccount(accountId = this.connectedAccountId): Promise<ConnectedAccountHealth> {
    const details = await this.getConnectedAccountDetails(accountId);
    if (!details) {
      throw new Error("Composio connected account response omitted account id");
    }
    return {
      id: details.id,
      status: details.status,
      isDisabled: details.isDisabled,
      toolkitSlug: details.toolkitSlug,
    };
  }

  /**
   * Pinned account plus safe scopes metadata for Connections status (CN-005).
   * Never returns tokens or credentials.
   */
  async getConnectedAccountDetails(accountId = this.connectedAccountId): Promise<
    | (ConnectedAccountHealth & {
        scopes: string[];
        authConfigId?: string;
      })
    | null
  > {
    const payload = await this.request<Record<string, unknown>>(
      "GET",
      `/api/v3.1/connected_accounts/${encodeURIComponent(accountId)}`,
    );
    const toolkit =
      payload.toolkit && typeof payload.toolkit === "object"
        ? (payload.toolkit as Record<string, unknown>)
        : {};
    const toolkitSlug =
      typeof toolkit.slug === "string"
        ? toolkit.slug
        : typeof payload.appUniqueId === "string"
          ? payload.appUniqueId
          : undefined;
    const authConfig =
      payload.auth_config && typeof payload.auth_config === "object"
        ? (payload.auth_config as Record<string, unknown>)
        : {};
    const observedAccountId =
      typeof payload.id === "string" && payload.id.length > 0 ? payload.id : null;
    if (!observedAccountId) {
      return null;
    }
    return {
      id: observedAccountId,
      status: typeof payload.status === "string" ? payload.status : "UNKNOWN",
      isDisabled: payload.is_disabled === true,
      toolkitSlug,
      scopes: parseGrantedScopes(payload),
      ...(typeof authConfig.id === "string" ? { authConfigId: authConfig.id } : {}),
    };
  }

  /**
   * Create a short-lived Composio Connect Link for reconnect.
   * The provisional connected_account_id from the provider must never replace the pinned account.
   */
  async createConnectLink(input?: {
    authConfigId?: string;
    callbackUrl?: string;
    userId?: string;
  }): Promise<{
    linkToken: string;
    redirectUrl: string;
    expiresAt: string;
    provisionalConnectedAccountId: string | null;
  }> {
    const authConfigId = (input?.authConfigId ?? this.authConfigId ?? "").trim();
    if (!authConfigId) {
      throw new Error("COMPOSIO_AUTH_CONFIG_ID is required for Connect Link reconnect");
    }
    const body: Record<string, unknown> = {
      auth_config_id: authConfigId,
      user_id: (input?.userId ?? this.userId).trim(),
    };
    if (input?.callbackUrl?.trim()) {
      body.callback_url = input.callbackUrl.trim();
    }
    const payload = await this.request<Record<string, unknown>>(
      "POST",
      "/api/v3.1/connected_accounts/link",
      body,
    );
    const redirectUrl =
      typeof payload.redirect_url === "string"
        ? payload.redirect_url
        : typeof payload.redirectUrl === "string"
          ? payload.redirectUrl
          : "";
    if (!redirectUrl) {
      throw new Error("Composio Connect Link response missing redirect_url");
    }
    const linkToken =
      typeof payload.link_token === "string"
        ? payload.link_token
        : typeof payload.linkToken === "string"
          ? payload.linkToken
          : "";
    const expiresAt =
      typeof payload.expires_at === "string"
        ? payload.expires_at
        : typeof payload.expiresAt === "string"
          ? payload.expiresAt
          : new Date(Date.now() + 10 * 60_000).toISOString();
    const provisional =
      typeof payload.connected_account_id === "string"
        ? payload.connected_account_id
        : typeof payload.connectedAccountId === "string"
          ? payload.connectedAccountId
          : null;
    return {
      linkToken,
      redirectUrl,
      expiresAt,
      provisionalConnectedAccountId: provisional,
    };
  }

  /**
   * Execute an exact direct tool against the pinned connected account.
   * Used for live read probes and deterministic reconciliation; MCP/TrueForge
   * runtime also targets these same literal slugs (never meta-execute wrappers).
   * The returned `raw` payload must stay process-side only.
   */
  async executeDirectTool(input: {
    toolSlug: string;
    arguments: Record<string, unknown>;
    connectedAccountId?: string;
  }): Promise<{
    toolSlug: string;
    httpStatus: number;
    raw: unknown;
    successful: boolean | null;
    authFailure: boolean;
  }> {
    const toolSlug = input.toolSlug.trim();
    if (!(P0_COMPOSIO_DIRECT_TOOLS as readonly string[]).includes(toolSlug)) {
      throw new Error(`executeDirectTool rejected unknown tool ${toolSlug}`);
    }
    if ((P0_COMPOSIO_FORBIDDEN_SURFACES as readonly string[]).includes(toolSlug)) {
      throw new Error(`executeDirectTool rejected forbidden meta-tool ${toolSlug}`);
    }
    const requested = input.connectedAccountId?.trim();
    if (requested && requested !== this.connectedAccountId) {
      throw new Error("executeDirectTool connectedAccountId must match the client pinned account");
    }
    const accountId = this.connectedAccountId;
    const response = await this.fetchImpl(
      `${this.baseUrl}/api/v3.1/tools/execute/${encodeURIComponent(toolSlug)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify({
          connected_account_id: accountId,
          user_id: this.userId,
          arguments: input.arguments,
        }),
      },
    );
    const text = await response.text();
    let raw: unknown = text;
    try {
      raw = text ? JSON.parse(text) : null;
    } catch {
      // keep text
    }
    const successful =
      raw && typeof raw === "object" && !Array.isArray(raw) && "successful" in raw
        ? typeof (raw as { successful?: unknown }).successful === "boolean"
          ? (raw as { successful: boolean }).successful
          : null
        : null;
    return {
      toolSlug,
      httpStatus: response.status,
      raw,
      successful,
      authFailure: isComposioAuthFailure(raw, response.status),
    };
  }

  private unwrapSession(payload: RawSessionResponse): ComposioHostedSession {
    const sessionId = payload.session_id;
    if (!sessionId || typeof sessionId !== "string") {
      throw new Error("Composio session response missing session_id");
    }
    const mcpUrl = payload.mcp?.url;
    if (!mcpUrl || typeof mcpUrl !== "string") {
      throw new Error("Composio session response missing mcp.url");
    }
    const tools = asStringArray(payload.tool_router_tools);
    const config = parseConfigSnapshot(
      asRecord(payload.config),
      this.userId,
      this.connectedAccountId,
    );

    return {
      sessionId,
      tools,
      config,
      configVersion: typeof payload.config_version === "number" ? payload.config_version : 1,
      mcp: this.buildMcpSecrets(
        mcpUrl,
        payload.mcp?.headers && typeof payload.mcp.headers === "object"
          ? payload.mcp.headers
          : undefined,
      ),
    };
  }

  private async requestText(method: string, path: string): Promise<string> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        "x-api-key": this.apiKey,
      },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(
        `Composio ${method} ${path} failed (${response.status}): ${text.slice(0, 300)}`,
      );
    }
    return text;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // keep text
    }

    if (!response.ok) {
      const message =
        parsed &&
        typeof parsed === "object" &&
        "error" in parsed &&
        parsed.error &&
        typeof parsed.error === "object" &&
        "message" in parsed.error
          ? String((parsed.error as { message: unknown }).message)
          : text.slice(0, 300);
      throw new Error(`Composio ${method} ${path} failed (${response.status}): ${message}`);
    }

    return parsed as T;
  }
}

export function loadComposioSessionClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: { fetchImpl?: typeof fetch; baseUrl?: string } = {},
): ComposioSessionClient {
  return new ComposioSessionClient({
    apiKey: env.COMPOSIO_API_KEY ?? "",
    userId: env.COMPOSIO_USER_ID ?? "",
    connectedAccountId: env.COMPOSIO_CONNECTED_ACCOUNT_ID ?? "",
    authConfigId: env.COMPOSIO_AUTH_CONFIG_ID,
    baseUrl: options.baseUrl ?? env.COMPOSIO_BASE_URL,
    fetchImpl: options.fetchImpl,
  });
}
