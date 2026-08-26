import { describe, expect, it } from "vitest";
import { P0_MIGRATION, describeDatabaseAdapter, listForwardMigrations } from "./index";
import { downMigrationPath } from "./migrate";
import { existsSync } from "node:fs";

describe("database adapter", () => {
  it("ships the P0 foundation migration", () => {
    expect(describeDatabaseAdapter()).toEqual({
      adapter: "postgres-drizzle",
      migrations: P0_MIGRATION,
    });
    expect(listForwardMigrations()).toContain(P0_MIGRATION);
    expect(existsSync(downMigrationPath(P0_MIGRATION))).toBe(true);
  });
});
