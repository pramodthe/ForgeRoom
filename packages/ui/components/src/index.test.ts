import { describe, expect, it } from "vitest";
import { describeControlledUiBoundary } from "./index";

describe("controlled component boundary", () => {
  it("keeps the open generated UI rail disabled", () => {
    const boundary = describeControlledUiBoundary();
    expect(boundary.rail).toBe("registered_react");
    expect(boundary.openGeneratedUi).toBe("disabled");
    expect(boundary.registryVersion).toBe("registry-1");
    expect([...boundary.componentNames]).toEqual([
      "ApprovalCard",
      "ArtifactCard",
      "BarOrLineChart",
      "ChoiceForm",
      "ConnectionCard",
      "DataTable",
      "RequiredQuestionCard",
      "TaskCard",
    ]);
  });
});
