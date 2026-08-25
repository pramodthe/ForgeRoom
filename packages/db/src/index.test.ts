import { describe, expect, it } from "vitest";
import { describeDatabaseAdapter } from "./index";

describe("database adapter boundary", () => {
  it("reserves PostgreSQL/Drizzle without shipping migrations", () => {
    expect(describeDatabaseAdapter()).toEqual({
      adapter: "postgres-drizzle",
      migrations: "pending-P0-103",
    });
  });
});
