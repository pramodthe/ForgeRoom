export const OWNER_ROLE = "owner" as const;

export type WorkspaceRole = typeof OWNER_ROLE | "member";

export function isOwnerRole(role: string): role is typeof OWNER_ROLE {
  return role === OWNER_ROLE;
}

/** Recent auth is measured from password-login time, not cookie refresh. */
export function isRecentAuthentication(
  authenticatedAt: Date | string,
  now: Date | string,
  maxAgeMs: number,
): boolean {
  if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0) {
    return false;
  }
  const authenticatedMs = new Date(authenticatedAt).getTime();
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(authenticatedMs) || !Number.isFinite(nowMs)) {
    return false;
  }
  return nowMs - authenticatedMs <= maxAgeMs;
}
