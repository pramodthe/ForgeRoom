import { describe, expect, it } from "vitest";
import { componentToolName, stableNameFromComponentToolName } from "./tool-name";

describe("componentToolName", () => {
  it("lowercases the first character of the stable registry name", () => {
    expect(componentToolName("DataTable")).toBe("ui.dataTable");
    expect(componentToolName("Metric")).toBe("ui.metric");
    expect(componentToolName("BarOrLineChart")).toBe("ui.barOrLineChart");
  });

  it("reverses ui.* tool names back to stable registry names", () => {
    expect(stableNameFromComponentToolName("ui.dataTable")).toBe("DataTable");
    expect(stableNameFromComponentToolName("ui.metric")).toBe("Metric");
  });
});
