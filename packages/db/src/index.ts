export const DATABASE_ADAPTER = "postgres-drizzle" as const;

export type DatabaseAdapter = typeof DATABASE_ADAPTER;

export const P0_MIGRATION = "0001_p0_foundation.sql" as const;

export function describeDatabaseAdapter(): {
  adapter: DatabaseAdapter;
  migrations: typeof P0_MIGRATION;
} {
  return { adapter: DATABASE_ADAPTER, migrations: P0_MIGRATION };
}

export { createDb, createSql, databaseUrl, DEFAULT_DATABASE_URL } from "./client";
export { migrate, rollbackLast, listForwardMigrations, MIGRATIONS_DIR } from "./migrate";
export * from "./schema";
