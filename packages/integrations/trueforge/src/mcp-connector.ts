import type { TrueForgeMcpServerRef } from "./types";

export type TrueForgeMcpServerManifest = {
  type: "remote";
  name: string;
  url: string;
  description: string;
  auth?: {
    type: "header";
    headers: Record<string, string>;
  };
};

export type TrueForgeConfiguredMcpServer = {
  name: string;
  manifest: TrueForgeMcpServerManifest;
  auth_status: {
    status: "authenticated" | "auth_required" | "not_required";
    authorization_url?: string;
  };
};

export type TrueForgeMcpTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  [key: string]: unknown;
};

export type RegisterHeaderAuthMcpServerInput = {
  name: string;
  url: string;
  description: string;
  /** Server-side headers only — never log or persist in application DB JSON. */
  headers: Record<string, string>;
};

export type TrueForgeJsonRequester = {
  requestJson<T>(method: string, path: string, body?: unknown): Promise<T>;
};

/**
 * Create or replace a TrueForge header-auth remote MCP connector
 * (`PUT /api/v1/settings/mcp-servers`).
 */
export async function registerHeaderAuthMcpServer(
  client: TrueForgeJsonRequester,
  input: RegisterHeaderAuthMcpServerInput,
): Promise<TrueForgeConfiguredMcpServer> {
  if (!input.name.trim()) {
    throw new Error("MCP server name is required");
  }
  if (!input.url.trim()) {
    throw new Error("MCP server url is required");
  }
  if (Object.keys(input.headers).length === 0) {
    throw new Error("header-auth MCP registration requires at least one header");
  }

  const payload = await client.requestJson<unknown>("PUT", "/api/v1/settings/mcp-servers", {
    manifest: {
      type: "remote",
      name: input.name.trim(),
      url: input.url.trim(),
      description: input.description.trim() || `ForgeRoom connector ${input.name}`,
      auth: {
        type: "header",
        headers: { ...input.headers },
      },
    } satisfies TrueForgeMcpServerManifest,
  });

  return unwrapConfiguredMcpServer(payload);
}

/** List tools exposed by a configured MCP connector (`GET /api/v1/mcp-servers/{name}/tools`). */
export async function listMcpServerTools(
  client: TrueForgeJsonRequester,
  name: string,
): Promise<TrueForgeMcpTool[]> {
  const payload = await client.requestJson<unknown>(
    "GET",
    `/api/v1/mcp-servers/${encodeURIComponent(name)}/tools`,
  );
  return unwrapMcpTools(payload);
}

export function mcpToolNames(tools: readonly TrueForgeMcpTool[]): string[] {
  return tools
    .map((tool) => tool.name)
    .filter((name): name is string => typeof name === "string" && name.length > 0);
}

/**
 * Build the AgentSpec `mcp_servers` entry for a registered Composio connector.
 */
export function composioConnectorMcpRef(input: {
  connectorName: string;
  enabledTools: readonly string[];
  approvalRequiredTools: readonly string[];
}): TrueForgeMcpServerRef {
  return {
    name: input.connectorName,
    enable_tools: [...input.enabledTools],
    require_approval_for_tools:
      input.approvalRequiredTools.length > 0
        ? [...input.approvalRequiredTools]
        : ["@write", "@destructive"],
    preload: false,
  };
}

function unwrapConfiguredMcpServer(payload: unknown): TrueForgeConfiguredMcpServer {
  const data =
    payload && typeof payload === "object" && "data" in payload
      ? (payload as { data: unknown }).data
      : payload;
  if (!data || typeof data !== "object" || !("name" in data)) {
    throw new Error("TrueForge MCP server response missing name");
  }
  const row = data as Record<string, unknown>;
  const manifest =
    row.manifest && typeof row.manifest === "object"
      ? (row.manifest as TrueForgeMcpServerManifest)
      : null;
  if (!manifest) {
    throw new Error("TrueForge MCP server response missing manifest");
  }
  const authStatus =
    row.auth_status && typeof row.auth_status === "object"
      ? (row.auth_status as TrueForgeConfiguredMcpServer["auth_status"])
      : { status: "not_required" as const };
  return {
    name: String(row.name),
    manifest,
    auth_status: authStatus,
  };
}

function unwrapMcpTools(payload: unknown): TrueForgeMcpTool[] {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const data = Array.isArray(root.data) ? root.data : Array.isArray(payload) ? payload : [];
  return data.filter(
    (row): row is TrueForgeMcpTool =>
      !!row && typeof row === "object" && typeof (row as { name?: unknown }).name === "string",
  );
}
