import { describe, expect, it } from "vitest";
import { formatRedactedRecord } from "./format-redacted-record";

describe("formatRedactedRecord", () => {
  it("renders strings and scalars without JSON syntax", () => {
    expect(formatRedactedRecord("Update issue title")).toBe("Update issue title");
    expect(formatRedactedRecord(42)).toBe("42");
    expect(formatRedactedRecord(true)).toBe("Yes");
    expect(formatRedactedRecord(false)).toBe("No");
  });

  it("renders objects as labeled lines", () => {
    expect(
      formatRedactedRecord({
        repository: "forgeroom",
        issue_number: 35,
        labels: ["probe"],
      }),
    ).toBe("Repository: forgeroom\nIssue Number: 35\nLabels: 1. probe");
  });

  it("never returns JSON.stringify output for nested records", () => {
    const formatted = formatRedactedRecord({
      target: { owner: "acme", repo: "ops" },
      dry_run: false,
    });
    expect(formatted).not.toContain("{");
    expect(formatted).not.toContain("}");
    expect(formatted).toContain("Target:");
    expect(formatted).toContain("Owner: acme");
    expect(formatted).toContain("Dry Run: No");
  });
});
