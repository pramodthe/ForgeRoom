import { and, eq } from "drizzle-orm";
import { authSessions, createDb, createSql, memberships, users } from "@forgeroom/db";
import type { AuthStore } from "./store";
import { createMemoryAuthStore } from "./store";

type SqlClient = ReturnType<typeof createSql>;

export function createPostgresAuthStore(sql: SqlClient): AuthStore {
  const db = createDb(sql);

  return {
    async getUserByEmail(email) {
      const rows = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);
      const row = rows[0];
      return row
        ? {
            id: row.id,
            email: row.email,
            displayName: row.displayName,
            passwordHash: row.passwordHash,
          }
        : null;
    },
    async getUserById(id) {
      const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
      const row = rows[0];
      return row
        ? {
            id: row.id,
            email: row.email,
            displayName: row.displayName,
            passwordHash: row.passwordHash,
          }
        : null;
    },
    async upsertOwner(input) {
      const email = input.user.email.toLowerCase();
      const createdAt = new Date().toISOString();
      await sql.begin(async (tx) => {
        await tx`
          INSERT INTO users (id, email, display_name, password_hash, created_at)
          VALUES (${input.user.id}, ${email}, ${input.user.displayName}, ${input.user.passwordHash}, ${createdAt})
          ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email,
            display_name = EXCLUDED.display_name,
            password_hash = EXCLUDED.password_hash
        `;
        await tx`
          INSERT INTO workspaces (id, name, slug, policy_json, created_by, created_at)
          VALUES (${input.workspaceId}, ${input.workspaceName}, ${input.workspaceSlug}, '{}'::jsonb, ${input.user.id}, ${createdAt})
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            slug = EXCLUDED.slug
        `;
        await tx`
          INSERT INTO memberships (workspace_id, user_id, role, status, created_at)
          VALUES (${input.workspaceId}, ${input.user.id}, 'owner', 'active', ${createdAt})
          ON CONFLICT (workspace_id, user_id) DO UPDATE SET
            role = 'owner',
            status = 'active'
        `;
      });
    },
    async createSession(session) {
      await db.insert(authSessions).values({
        id: session.id,
        userId: session.userId,
        secretHash: session.secretHash,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt,
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
      });
    },
    async getSession(id) {
      const rows = await db.select().from(authSessions).where(eq(authSessions.id, id)).limit(1);
      const row = rows[0];
      return row
        ? {
            id: row.id,
            userId: row.userId,
            secretHash: row.secretHash,
            expiresAt: row.expiresAt,
            revokedAt: row.revokedAt,
            createdAt: row.createdAt,
            lastSeenAt: row.lastSeenAt,
          }
        : null;
    },
    async touchSession(id, lastSeenAt) {
      await db.update(authSessions).set({ lastSeenAt }).where(eq(authSessions.id, id));
    },
    async revokeSession(id, revokedAt) {
      await db.update(authSessions).set({ revokedAt }).where(eq(authSessions.id, id));
    },
    async getActiveOwnerMembership(userId) {
      const rows = await db
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.userId, userId),
            eq(memberships.role, "owner"),
            eq(memberships.status, "active"),
          ),
        )
        .limit(1);
      const row = rows[0];
      return row
        ? {
            workspaceId: row.workspaceId,
            userId: row.userId,
            role: "owner" as const,
            status: "active" as const,
          }
        : null;
    },
  };
}

export function createDefaultAuthStore(env: {
  authStore: "memory" | "postgres";
  databaseUrl?: string;
}): {
  store: AuthStore;
  sql?: SqlClient;
  close?: () => Promise<void>;
} {
  if (env.authStore === "memory") {
    return { store: createMemoryAuthStore() };
  }
  const sql = createSql(env.databaseUrl);
  return {
    store: createPostgresAuthStore(sql),
    sql,
    close: async () => {
      await sql.end({ timeout: 1 });
    },
  };
}
