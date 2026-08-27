import type { CreateSessionInput, TrueForgeClientOptions, TrueForgeSession } from "./types";

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
    const payload = await this.request<unknown>("POST", "/api/v1/sessions", {
      agent: { spec: input.spec },
    });
    return unwrapSession(payload);
  }

  async getSession(sessionId: string): Promise<TrueForgeSession> {
    const payload = await this.request<unknown>(
      "GET",
      `/api/v1/sessions/${encodeURIComponent(sessionId)}`,
    );
    return unwrapSession(payload);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
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
