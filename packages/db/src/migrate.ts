import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type postgres from "postgres";

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const MIGRATION_ADVISORY_LOCK =
  "SELECT pg_advisory_xact_lock(hashtextextended('forgeroom:schema-migrations', 0))";

export function listForwardMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => /^\d+_.+\.sql$/.test(file) && !file.endsWith(".down.sql"))
    .sort();
}

export function downMigrationPath(forwardFile: string): string {
  return join(MIGRATIONS_DIR, forwardFile.replace(/\.sql$/, ".down.sql"));
}

async function ensureJournal(sql: postgres.Sql | postgres.TransactionSql): Promise<void> {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS forgeroom_schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export async function appliedMigrations(sql: postgres.Sql): Promise<string[]> {
  await ensureJournal(sql);
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM forgeroom_schema_migrations ORDER BY id
  `;
  return rows.map((row) => row.id);
}

export async function migrate(sql: postgres.Sql): Promise<string[]> {
  return sql.begin(async (tx) => {
    await tx.unsafe(MIGRATION_ADVISORY_LOCK);
    await ensureJournal(tx);
    const rows = await tx<{ id: string }[]>`
      SELECT id FROM forgeroom_schema_migrations ORDER BY id
    `;
    const applied = new Set(rows.map((row) => row.id));
    const newlyApplied: string[] = [];

    for (const file of listForwardMigrations()) {
      if (applied.has(file)) {
        continue;
      }
      const body = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      await tx.unsafe(body);
      await tx`INSERT INTO forgeroom_schema_migrations (id) VALUES (${file})`;
      newlyApplied.push(file);
    }

    return newlyApplied;
  });
}

export async function rollbackLast(sql: postgres.Sql): Promise<string | null> {
  return sql.begin(async (tx) => {
    await tx.unsafe(MIGRATION_ADVISORY_LOCK);
    await ensureJournal(tx);
    const applied = await tx<{ id: string }[]>`
      SELECT id FROM forgeroom_schema_migrations ORDER BY id
    `;
    const last = applied.at(-1)?.id;
    if (!last) {
      return null;
    }
    const downFile = downMigrationPath(last);
    if (!existsSync(downFile)) {
      throw new Error(`Missing down migration for ${last}`);
    }
    const body = readFileSync(downFile, "utf8");
    await tx.unsafe(body);
    await tx`DELETE FROM forgeroom_schema_migrations WHERE id = ${last}`;
    return last;
  });
}
