export const DATABASE_ADAPTER = "postgres-drizzle" as const;

export type DatabaseAdapter = typeof DATABASE_ADAPTER;

/** Schema, migrations and the Drizzle client are owned by P0-103. */
export function describeDatabaseAdapter(): {
  adapter: DatabaseAdapter;
  migrations: "pending-P0-103";
} {
  return { adapter: DATABASE_ADAPTER, migrations: "pending-P0-103" };
}
