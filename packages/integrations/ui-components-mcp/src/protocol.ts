import { z } from "zod";
import {
  listControlledComponentMcpTools,
  resolveStableNameForMcpTool,
  type UiComponentsMcpTool,
} from "./tools";

const jsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  method: z.string().min(1),
  params: z.unknown().optional(),
});

const jsonRpcNotificationSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string().min(1),
  params: z.unknown().optional(),
});

export type JsonRpcRequest = z.infer<typeof jsonRpcRequestSchema>;

export type JsonRpcNotification = z.infer<typeof jsonRpcNotificationSchema>;

export type JsonRpcMessage =
  | { kind: "request"; request: JsonRpcRequest }
  | { kind: "notification"; notification: JsonRpcNotification };

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export type ComponentToolCallResult = {
  status: "ready" | "awaiting_component_input" | "quarantined";
  instanceId: string;
  renderRevision: number | null;
  textAlternative: string;
  componentName: string;
};

export type UiComponentsMcpHandlers = {
  enabledToolNames: readonly string[];
  callTool: (input: {
    toolName: string;
    stableName: string;
    arguments: Record<string, unknown>;
    requestId: string | number;
  }) => Promise<ComponentToolCallResult>;
};

export function parseJsonRpcRequest(body: unknown): JsonRpcRequest | null {
  const parsed = jsonRpcRequestSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

export function parseJsonRpcMessage(body: unknown): JsonRpcMessage | null {
  const request = jsonRpcRequestSchema.safeParse(body);
  if (request.success) {
    return { kind: "request", request: request.data };
  }
  const notification = jsonRpcNotificationSchema.safeParse(body);
  if (notification.success) {
    return { kind: "notification", notification: notification.data };
  }
  return null;
}

export function handleUiComponentsMcpNotification(notification: JsonRpcNotification): void {
  if (notification.method === "notifications/initialized") {
    return;
  }
}

export async function handleUiComponentsMcpRequest(
  request: JsonRpcRequest,
  handlers: UiComponentsMcpHandlers,
): Promise<JsonRpcResponse> {
  const id = request.id;
  try {
    if (request.method === "initialize") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-10-07",
          capabilities: { tools: {} },
          serverInfo: { name: "forgeroom-ui-components-mcp", version: "1.0.0" },
        },
      };
    }
    if (request.method === "tools/list") {
      const tools = listControlledComponentMcpTools(handlers.enabledToolNames);
      return {
        jsonrpc: "2.0",
        id,
        result: { tools: tools.map(toMcpToolShape) },
      };
    }
    if (request.method === "tools/call") {
      const params =
        request.params && typeof request.params === "object"
          ? (request.params as Record<string, unknown>)
          : {};
      const toolName = typeof params.name === "string" ? params.name : "";
      const stableName = resolveStableNameForMcpTool(toolName);
      if (!stableName) {
        return rpcError(id, -32602, `Unknown component tool ${toolName}`);
      }
      if (!handlers.enabledToolNames.includes(toolName)) {
        return rpcError(id, -32602, `Component tool ${toolName} is not offered in this session`);
      }
      const args =
        params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
          ? (params.arguments as Record<string, unknown>)
          : {};
      const result = await handlers.callTool({
        toolName,
        stableName,
        arguments: args,
        requestId: id,
      });
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: result.status,
                instanceId: result.instanceId,
                renderRevision: result.renderRevision,
                textAlternative: result.textAlternative,
                componentName: result.componentName,
              }),
            },
          ],
          isError: result.status === "quarantined",
        },
      };
    }
    return rpcError(id, -32601, `Method not found: ${request.method}`);
  } catch (error) {
    console.error("ui_components_mcp request failed", {
      method: request.method,
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    return rpcError(id, -32000, "Component tool call failed");
  }
}

function toMcpToolShape(tool: UiComponentsMcpTool) {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  };
}

function rpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message, ...(data !== undefined ? { data } : {}) },
  };
}
