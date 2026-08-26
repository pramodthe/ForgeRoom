export type StoredUser = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
};

export type StoredMembership = {
  workspaceId: string;
  userId: string;
  role: "owner" | "member";
  status: "active" | "disabled";
};

export type StoredSession = {
  id: string;
  userId: string;
  secretHash: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  lastSeenAt: string;
};

export type AuthStore = {
  getUserByEmail(email: string): Promise<StoredUser | null>;
  getUserById(id: string): Promise<StoredUser | null>;
  upsertOwner(input: {
    user: StoredUser;
    workspaceId: string;
    workspaceName: string;
    workspaceSlug: string;
  }): Promise<void>;
  createSession(session: StoredSession): Promise<void>;
  getSession(id: string): Promise<StoredSession | null>;
  touchSession(id: string, lastSeenAt: string): Promise<void>;
  revokeSession(id: string, revokedAt: string): Promise<void>;
  getActiveOwnerMembership(userId: string): Promise<StoredMembership | null>;
};

export function createMemoryAuthStore(): AuthStore {
  const usersById = new Map<string, StoredUser>();
  const usersByEmail = new Map<string, StoredUser>();
  const memberships = new Map<string, StoredMembership>();
  const sessions = new Map<string, StoredSession>();
  const workspaces = new Map<string, { id: string; name: string; slug: string }>();

  return {
    async getUserByEmail(email) {
      return usersByEmail.get(email.toLowerCase()) ?? null;
    },
    async getUserById(id) {
      return usersById.get(id) ?? null;
    },
    async upsertOwner(input) {
      const normalized = {
        ...input.user,
        email: input.user.email.toLowerCase(),
      };
      usersById.set(normalized.id, normalized);
      usersByEmail.set(normalized.email, normalized);
      workspaces.set(input.workspaceId, {
        id: input.workspaceId,
        name: input.workspaceName,
        slug: input.workspaceSlug,
      });
      memberships.set(`${input.workspaceId}:${normalized.id}`, {
        workspaceId: input.workspaceId,
        userId: normalized.id,
        role: "owner",
        status: "active",
      });
    },
    async createSession(session) {
      sessions.set(session.id, session);
    },
    async getSession(id) {
      return sessions.get(id) ?? null;
    },
    async touchSession(id, lastSeenAt) {
      const current = sessions.get(id);
      if (!current) {
        return;
      }
      sessions.set(id, { ...current, lastSeenAt });
    },
    async revokeSession(id, revokedAt) {
      const current = sessions.get(id);
      if (!current) {
        return;
      }
      sessions.set(id, { ...current, revokedAt });
    },
    async getActiveOwnerMembership(userId) {
      for (const membership of memberships.values()) {
        if (
          membership.userId === userId &&
          membership.role === "owner" &&
          membership.status === "active"
        ) {
          return membership;
        }
      }
      return null;
    },
  };
}
