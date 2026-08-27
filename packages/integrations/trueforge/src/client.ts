import type {
  CreateSessionInput,
  CreateTurnInput,
  TrueForgeClientOptions,
  TrueForgeSession,
  TrueForgeTurn,
  TrueForgeTurnEvent,
} from "./types";
import type {
  RegisterHeaderAuthMcpServerInput,
  TrueForgeConfiguredMcpServer,
  TrueForgeMcpTool,
} from "./mcp-connector";
import {
  listMcpServerTools as listMcpServerToolsImpl,
  registerHeaderAuthMcpServer as registerHeaderAuthMcpServerImpl,
} from "./mcp-connector";

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export class TrueForgeClient {
  readonly baseUrl: string;
  private readonly apiKey: string | null;
  private readonly fetchImpl: typeof fetch;

  constructor(options: TrueForgeClientOptions) {
    if (!options.baseUrl.trim()) {
      throw new Error("TRUEFORGE_BASE_URL is required");
    }
    this.baseUrl = trimTrailingSlash(options.baseUrl.trim());
    this.apiKey = options.apiKey?.trim() || null;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async createSession(input: CreateSessionInput): Promise<TrueForgeSession> {
    const payload = await this.requestJson<unknown>("POST", "/api/v1/sessions", {
      agent: { spec: input.spec },
    });
    return unwrapSession(payload);
  }

  async getSession(sessionId: string): Promise<TrueForgeSession> {
    const payload = await this.requestJson<unknown>(
      "GET",
      `/api/v1/sessions/${encodeURIComponent(sessionId)}`,
    );
    return unwrapSession(payload);
  }

  async createTurn(sessionId: string, input: CreateTurnInput): Promise<TrueForgeTurn> {
    const payload = await this.requestJson<unknown>(
      "POST",
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/turns`,
      {
        input: input.input,
        previous_turn_id: input.previousTurnId,
        stream: input.stream ?? false,
      },
    );
    return unwrapTurn(payload);
  }

  async listTurns(
    sessionId: string,
    options: { limit?: number; pageToken?: string } = {},
  ): Promise<{ turns: TrueForgeTurn[]; nextPageToken: string | null }> {
    const params = new URLSearchParams();
    if (options.limit !== undefined) {
      params.set("limit", String(options.limit));
    }
    if (options.pageToken) {
      params.set("page_token", options.pageToken);
    }
    const query = params.toString();
    const path = `/api/v1/sessions/${encodeURIComponent(sessionId)}/turns${query ? `?${query}` : ""}`;
    const payload = await this.requestJson<unknown>("GET", path);
    return unwrapTurnList(payload);
  }

  async getTurn(sessionId: string, turnId: string): Promise<TrueForgeTurn> {
    const payload = await this.requestJson<unknown>(
      "GET",
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/turns/${encodeURIComponent(turnId)}`,
    );
    return unwrapTurn(payload);
  }

  async listTurnEvents(sessionId: string, turnId: string): Promise<TrueForgeTurnEvent[]> {
    const payload = await this.requestJson<unknown>(
      "GET",
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/turns/${encodeURIComponent(turnId)}/events`,
    );
    return unwrapTurnEvents(payload);
  }

  async cancelSession(
    sessionId: string,
    body: Record<string, unknown> = {},
  ): Promise<{ cancelled: boolean; raw: unknown }> {
    const payload = await this.requestJson<unknown>(
      "POST",
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/cancel`,
      body,
    );
    return { cancelled: true, raw: payload };
  }

  /** Register or replace a header-auth remote MCP connector (Composio hosted MCP). */
  async registerHeaderAuthMcpServer(
    input: RegisterHeaderAuthMcpServerInput,
  ): Promise<TrueForgeConfiguredMcpServer> {
    return registerHeaderAuthMcpServerImpl(this, input);
  }

  /** Query connector tools for startup manifest verification. */
  async listMcpServerTools(name: string): Promise<TrueForgeMcpTool[]> {
    return listMcpServerToolsImpl(this, name);
  }

  async requestJson<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }
    let payload: string | undefined;
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: payload,
    });
    const text = await response.text();
    let parsed: unknown = null;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    if (!response.ok) {
      const message =
        typeof parsed === "object" &&
        parsed &&
        "error" in parsed &&
        typeof (parsed as { error?: { message?: unknown } }).error?.message === "string"
          ? (parsed as { error: { message: string } }).error.message
          : `TrueForge ${method} ${path} failed (${response.status})`;
      throw new Error(message);
    }
    return parsed as T;
  }
}

function unwrapSession(payload: unknown): TrueForgeSession {
  const data =
    payload && typeof payload === "object" && "data" in payload
      ? (payload as { data: unknown }).data
      : payload;
  if (!data || typeof data !== "object" || !("id" in data) || typeof data.id !== "string") {
    throw new Error("TrueForge session response missing id");
  }
  const row = data as Record<string, unknown>;
  return {
    id: row.id as string,
    agent: row.agent,
    title: (row.title as string | null | undefined) ?? null,
    created_by: String(row.created_by ?? ""),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function unwrapTurn(payload: unknown): TrueForgeTurn {
  const data =
    payload && typeof payload === "object" && "data" in payload
      ? (payload as { data: unknown }).data
      : payload;
  if (!data || typeof data !== "object" || !("id" in data) || typeof data.id !== "string") {
    throw new Error("TrueForge turn response missing id");
  }
  const row = data as Record<string, unknown>;
  return {
    id: row.id as string,
    session_id: String(row.session_id ?? ""),
    previous_turn_id: (row.previous_turn_id as string | null | undefined) ?? null,
    input: Array.isArray(row.input) ? (row.input as TrueForgeTurn["input"]) : [],
    state: (row.state as TrueForgeTurn["state"]) ?? { status: "unknown" },
    created_at: String(row.created_at ?? ""),
  };
}

function unwrapTurnList(payload: unknown): {
  turns: TrueForgeTurn[];
  nextPageToken: string | null;
} {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const data = Array.isArray(root.data) ? root.data : [];
  const pagination =
    root.pagination && typeof root.pagination === "object"
      ? (root.pagination as Record<string, unknown>)
      : {};
  return {
    turns: data.map((row) => unwrapTurn(row)),
    nextPageToken:
      typeof pagination.next_page_token === "string" ? pagination.next_page_token : null,
  };
}

function unwrapTurnEvents(payload: unknown): TrueForgeTurnEvent[] {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const data = Array.isArray(root.data) ? root.data : Array.isArray(payload) ? payload : [];
  return data.filter(
    (row): row is TrueForgeTurnEvent =>
      !!row && typeof row === "object" && typeof (row as { type?: unknown }).type === "string",
  );
}

export function loadTrueForgeClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: typeof fetch,
): TrueForgeClient {
  return new TrueForgeClient({
    baseUrl: env.TRUEFORGE_BASE_URL ?? "http://127.0.0.1:8790",
    apiKey: env.TRUEFORGE_API_KEY,
    fetchImpl,
  });
}
