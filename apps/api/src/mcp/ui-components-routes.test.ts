import { describe, expect, it } from "vitest";
import { buildMcpToolCallId, prepareTaskToolArguments } from "./ui-components-routes";

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

describe("prepareTaskToolArguments", () => {
  it("injects authoritative active-run provenance for creates", () => {
    expect(
      prepareTaskToolArguments({
        channelId: "ch_1",
        rawArgs: { channel_id: "ch_1", title: "Task", idempotency_key: "key" },
        provenance: { runId: "run_1", sourceMessageId: "msg_1" },
      }),
    ).toEqual({
      ok: true,
      args: {
        channel_id: "ch_1",
        title: "Task",
        idempotency_key: "key",
        source_run_id: "run_1",
        source_message_id: "msg_1",
      },
    });
  });

  it("rejects cross-channel and forged provenance", () => {
    expect(
      prepareTaskToolArguments({
        channelId: "ch_1",
        rawArgs: { channel_id: "ch_2", idempotency_key: "key" },
        provenance: null,
      }),
    ).toMatchObject({ ok: false });
    expect(
      prepareTaskToolArguments({
        channelId: "ch_1",
        rawArgs: {
          channel_id: "ch_1",
          idempotency_key: "key",
          source_run_id: "forged",
        },
        provenance: { runId: "run_1", sourceMessageId: "msg_1" },
      }),
    ).toMatchObject({ ok: false });
  });
});
