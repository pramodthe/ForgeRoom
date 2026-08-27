import { notifyApiUnauthorized } from "./unauthorized";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

type ApiFetchOptions = RequestInit & {
  csrfToken?: string;
};

async function readApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string };
    };
    return new ApiError(
      body.error?.code ?? "unknown",
      body.error?.message ?? response.statusText,
      response.status,
    );
  } catch {
    return new ApiError("unknown", response.statusText, response.status);
  }
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.csrfToken) {
    headers.set("x-csrf-token", options.csrfToken);
  }
  if (options.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    if (response.status === 401) {
      notifyApiUnauthorized();
    }
    throw await readApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function newIdempotencyKey(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function stripRequestId<T extends { request_id?: string }>(body: T): Omit<T, "request_id"> {
  const { request_id: _requestId, ...rest } = body;
  return rest;
}
