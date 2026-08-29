import { describe, expect, it } from "vitest";
import { formatQuestionPromptLabel, formatRunEventDetail, formatRunEventTitle } from "./drawer";

describe("run drawer formatting", () => {
  it("formats known event titles and tool details", () => {
    expect(formatRunEventTitle("tool.succeeded")).toBe("Tool succeeded");
    expect(
      formatRunEventDetail("tool.succeeded", {
        tool_name: "GITHUB_GET_AN_ISSUE",
      }),
    ).toBe("GITHUB_GET_AN_ISSUE");
  });

  it("extracts question prompt labels", () => {
    expect(formatQuestionPromptLabel({ prompt: "Confirm the label?" })).toBe("Confirm the label?");
  });
});
