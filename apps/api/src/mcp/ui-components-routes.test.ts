import { describe, expect, it } from "vitest";
import { buildMcpToolCallId } from "./ui-components-routes";

const base = {
  generationId: "casg_1",
  toolName: "ui.dataTable",
  stableName: "DataTable",
  props: { columns: ["name"], rows: [{ name: "ForgeRoom" }] },
};

describe("buildMcpToolCallId", () => {
  it("preserves JSON-RPC ID type and punctuation without collisions", () => {
    const ids = [
      buildMcpToolCallId({ ...base, requestId: "a.b" }),
      buildMcpToolCallId({ ...base, requestId: "a/b" }),
      buildMcpToolCallId({ ...base, requestId: 1 }),
      buildMcpToolCallId({ ...base, requestId: "1" }),
    ];
    expect(new Set(ids)).toHaveLength(ids.length);
  });

  it("includes tool identity and canonical arguments while preserving exact replays", () => {
    const original = buildMcpToolCallId({ ...base, requestId: "request-1" });
    const reorderedReplay = buildMcpToolCallId({
      ...base,
      requestId: "request-1",
      props: { rows: [{ name: "ForgeRoom" }], columns: ["name"] },
    });
    const differentTool = buildMcpToolCallId({
      ...base,
      requestId: "request-1",
      toolName: "ui.metricCard",
      stableName: "MetricCard",
    });
    const differentProps = buildMcpToolCallId({
      ...base,
      requestId: "request-1",
      props: { columns: ["name"], rows: [{ name: "Different" }] },
    });

    expect(reorderedReplay).toBe(original);
    expect(differentTool).not.toBe(original);
    expect(differentProps).not.toBe(original);
  });
});
