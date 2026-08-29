import { describe, expect, it, vi } from "vitest";
import {
  handleUiComponentsMcpNotification,
  handleUiComponentsMcpRequest,
  parseJsonRpcMessage,
} from "./protocol";

describe("handleUiComponentsMcpRequest", () => {
  it("returns initialize capabilities", async () => {
    const response = await handleUiComponentsMcpRequest(
      { jsonrpc: "2.0", id: 1, method: "initialize" },
      { enabledToolNames: ["ui.dataTable"], callTool: vi.fn() },
    );
    expect(response.result).toMatchObject({
      protocolVersion: "2024-10-07",
      capabilities: { tools: {} },
    });
  });

  it("lists only enabled component tools", async () => {
    const response = await handleUiComponentsMcpRequest(
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { enabledToolNames: ["ui.dataTable"], callTool: vi.fn() },
    );
    const tools = (response.result as { tools: Array<{ name: string }> }).tools;
    expect(tools.map((tool) => tool.name)).toEqual(["ui_dataTable"]);
  });

  it("calls the broker for tools/call", async () => {
    const callTool = vi.fn(async () => ({
      status: "ready" as const,
      instanceId: "ui_1",
      renderRevision: 1,
      textAlternative: "Results",
      componentName: "ui.dataTable",
    }));
    const response = await handleUiComponentsMcpRequest(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "ui_dataTable", arguments: { caption: "Results" } },
      },
      { enabledToolNames: ["ui.dataTable"], callTool },
    );
    expect(callTool).toHaveBeenCalledWith({
      toolName: "ui.dataTable",
      stableName: "DataTable",
      arguments: { caption: "Results" },
      requestId: 3,
    });
    expect(response.result).toMatchObject({ isError: false });
  });

  it("lists and dispatches explicitly offered application tools", async () => {
    const callAdditionalTool = vi.fn(async () => ({
      content: [{ type: "text" as const, text: JSON.stringify({ ok: true }) }],
      isError: false,
    }));
    const handlers = {
      enabledToolNames: ["ui.dataTable"],
      additionalTools: [
        {
          name: "records.task.upsert.v1",
          description: "Create or update a TaskRecord",
          inputSchema: { type: "object" },
        },
      ],
      callAdditionalTool,
      callTool: vi.fn(),
    };
    const listed = await handleUiComponentsMcpRequest(
      { jsonrpc: "2.0", id: 4, method: "tools/list" },
      handlers,
    );
    expect(
      (listed.result as { tools: Array<{ name: string }> }).tools.map((tool) => tool.name),
    ).toEqual(["ui_dataTable", "records_task_upsert_v1"]);
    const called = await handleUiComponentsMcpRequest(
      {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "records_task_upsert_v1", arguments: { channel_id: "ch_1" } },
      },
      handlers,
    );
    expect(callAdditionalTool).toHaveBeenCalledWith({
      toolName: "records.task.upsert.v1",
      arguments: { channel_id: "ch_1" },
      requestId: 5,
    });
    expect(called.result).toMatchObject({ isError: false });
  });

  it("fails closed when canonical tools collide after provider-safe normalization", async () => {
    const response = await handleUiComponentsMcpRequest(
      { jsonrpc: "2.0", id: 6, method: "tools/list" },
      {
        enabledToolNames: ["ui.dataTable"],
        additionalTools: [
          {
            name: "ui_dataTable",
            description: "Ambiguous alias",
            inputSchema: { type: "object", additionalProperties: false, properties: {} },
          },
        ],
        callTool: vi.fn(),
      },
    );
    expect(response).toMatchObject({
      error: { code: -32000, message: "Component tool call failed" },
    });
  });

  it("parses notifications without an id", () => {
    const message = parseJsonRpcMessage({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    expect(message).toEqual({
      kind: "notification",
      notification: { jsonrpc: "2.0", method: "notifications/initialized" },
    });
    expect(() =>
      handleUiComponentsMcpNotification({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    ).not.toThrow();
  });
});
