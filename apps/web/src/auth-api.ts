import type { SessionResponse } from "@forgeroom/contracts";
import { sessionResponseSchema } from "@forgeroom/contracts";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

export async function fetchSession(): Promise<SessionResponse | null> {
  const response = await fetch(`${API_BASE}/api/session`, {
    credentials: "include",
  });
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return sessionResponseSchema.parse(await response.json());
}

export async function login(email: string, password: string): Promise<SessionResponse> {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return sessionResponseSchema.parse(await response.json());
}

export async function logout(csrfToken: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
    headers: {
      "x-csrf-token": csrfToken,
    },
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
}
