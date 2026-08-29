import { describe, expect, it } from "vitest";
import { coworkerDisplaySummary } from "./coworker-display";

describe("coworker display copy", () => {
  it("describes capabilities without accepting or exposing standing instructions", () => {
    const summary = coworkerDisplaySummary({
      handle: "operator",
      toolGrants: ["TASK_WRITE", "ARTIFACT_PUBLISH"],
    });

    expect(summary).toContain("governed work");
    expect(summary).not.toContain("standing");
  });

  it("makes read-only behavior explicit", () => {
    expect(
      coworkerDisplaySummary({
        handle: "researcher",
        toolGrants: ["GITHUB_GET_ISSUES", "SUPPORT_SEARCH"],
      }),
    ).toContain("without changing external systems");
  });
});
