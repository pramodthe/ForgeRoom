import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export const DEFAULT_DATABASE_URL = "postgres://forgeroom:forgeroom@127.0.0.1:5432/forgeroom";

export function databaseUrl(): string {
  return process.env.DATABASE_URL && process.env.DATABASE_URL.length > 0
    ? process.env.DATABASE_URL
    : DEFAULT_DATABASE_URL;
}

export function createSql(url = databaseUrl()) {
  return postgres(url, { max: 1, prepare: false, onnotice: () => undefined });
}

export function createDb(sql: ReturnType<typeof postgres>) {
  return drizzle(sql, { schema });
}
