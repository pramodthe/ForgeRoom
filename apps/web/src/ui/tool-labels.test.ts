import { describe, expect, it } from "vitest";
import { formatToolLabel, toolLabels } from "./tool-labels";

describe("tool labels", () => {
  it("turns internal slugs into concise, deduplicated labels", () => {
    expect(toolLabels(["GITHUB_GET_ISSUES", "GITHUB_GET_AN_ISSUE", "CHART_RENDER"])).toEqual([
      "GitHub read",
      "Charts",
    ]);
    expect(formatToolLabel("CUSTOM_READ_REPORT")).toBe("Custom Read Report");
  });
});
