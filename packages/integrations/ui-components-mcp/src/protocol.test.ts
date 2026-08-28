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
    expect(tools.map((tool) => tool.name)).toEqual(["ui.dataTable"]);
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
        params: { name: "ui.dataTable", arguments: { caption: "Results" } },
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
