import { describe, expect, it } from "vitest";
import { allowedRenderNodeIds, buildRenderNodeSet, primaryRenderNodeId } from "./render-nodes";

describe("component render nodes", () => {
  it("uses the P0 manifest root node id for agent-tool surfaces", () => {
    expect(primaryRenderNodeId("DataTable")).toBe("node_1");
    expect(buildRenderNodeSet("BarOrLineChart")).toEqual([{ nodeId: "node_1" }]);
    expect(allowedRenderNodeIds("TaskCard")).toEqual(["node_1"]);
  });
});
