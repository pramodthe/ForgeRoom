import type { SessionResponse } from "@forgeroom/contracts";
import { sessionResponseSchema } from "@forgeroom/contracts";
import { MOCK_SESSION } from "./api/mock-fixtures";
import { isFixtureMode } from "./api/mode";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
let fixtureSignedIn = true;

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

export async function fetchSession(): Promise<SessionResponse | null> {
  if (isFixtureMode) {
    return fixtureSignedIn ? sessionResponseSchema.parse(MOCK_SESSION) : null;
  }
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
  if (isFixtureMode) {
    if (!email.trim() || !password.trim()) {
      throw new Error("Enter an email and password.");
    }
    fixtureSignedIn = true;
    return sessionResponseSchema.parse(MOCK_SESSION);
  }
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
  if (isFixtureMode) {
    fixtureSignedIn = false;
    return;
  }
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
