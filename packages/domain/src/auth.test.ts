import { describe, expect, it } from "vitest";
import { isOwnerRole, isRecentAuthentication, OWNER_ROLE } from "./auth";

describe("owner auth helpers", () => {
  it("recognizes the owner role only", () => {
    expect(isOwnerRole(OWNER_ROLE)).toBe(true);
    expect(isOwnerRole("member")).toBe(false);
    expect(isOwnerRole("admin")).toBe(false);
  });

  it("treats recent authentication as a closed time window from login", () => {
    const authenticatedAt = "2026-08-26T16:00:00.000Z";
    expect(isRecentAuthentication(authenticatedAt, "2026-08-26T16:04:59.000Z", 5 * 60_000)).toBe(
      true,
    );
    expect(isRecentAuthentication(authenticatedAt, "2026-08-26T16:05:01.000Z", 5 * 60_000)).toBe(
      false,
    );
    expect(isRecentAuthentication("not-a-date", "2026-08-26T16:00:00.000Z", 5_000)).toBe(false);
    expect(
      isRecentAuthentication("2026-08-26T16:01:00.000Z", "2026-08-26T16:00:00.000Z", 5 * 60_000),
    ).toBe(false);
  });
});
