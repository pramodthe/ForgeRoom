import type { SessionResponse } from "@forgeroom/contracts";

export function isSessionExpired(session: SessionResponse, now: Date = new Date()): boolean {
  return new Date(session.expires_at).getTime() <= now.getTime();
}

export function sessionWorkspaceMismatch(session: SessionResponse, workspaceId: string): boolean {
  return session.workspace_id !== workspaceId;
}

export function liveSession(session: SessionResponse | null | undefined): SessionResponse | null {
  if (!session || isSessionExpired(session)) {
    return null;
  }
  return session;
}
