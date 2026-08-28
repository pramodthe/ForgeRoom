import type { Hono } from "hono";
import {
  brokerComponentToolMcpCall,
  loadComponentToolGenerationContext,
  type createSql,
} from "@forgeroom/db";
import {
  P0_UI_COMPONENTS_MCP_HEADER_NAME,
  handleUiComponentsMcpNotification,
  handleUiComponentsMcpRequest,
  parseJsonRpcMessage,
  verifyUiComponentsMcpSecret,
} from "@forgeroom/ui-components-mcp";
import type { ApiEnv } from "../env";
import { errorResponse } from "../http";

type SqlClient = ReturnType<typeof createSql>;

export function mountUiComponentsMcpRoutes(
  app: Hono,
  input: {
    env: ApiEnv;
    sql: SqlClient;
  },
) {
  app.post("/api/mcp/ui_components_v1/sessions/:generationId", async (c) => {
    const generationId = c.req.param("generationId");
    const providedSecret = c.req.header(P0_UI_COMPONENTS_MCP_HEADER_NAME);
    if (
      !providedSecret ||
      !verifyUiComponentsMcpSecret(input.env.uiComponentsMcpSecret, generationId, providedSecret)
    ) {
      const failure = errorResponse("unauthenticated", "Invalid UI components MCP credentials.", {
        status: 401,
      });
      return c.json(failure.body, failure.status);
    }

    const context = await loadComponentToolGenerationContext(input.sql, generationId);
    if (!context) {
      const failure = errorResponse("not_found", "Session generation not found.", { status: 404 });
      return c.json(failure.body, failure.status);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      const failure = errorResponse("validation_failed", "Request body must be JSON.", {
        status: 400,
      });
      return c.json(failure.body, failure.status);
    }

    const message = parseJsonRpcMessage(body);
    if (!message) {
      return c.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32600, message: "Invalid JSON-RPC request." },
        },
        400,
      );
    }

    if (message.kind === "notification") {
      handleUiComponentsMcpNotification(message.notification);
      return c.body(null, 204);
    }

    const response = await handleUiComponentsMcpRequest(message.request, {
      enabledToolNames: context.offeredComponentToolNames,
      callTool: async ({ stableName, arguments: props, requestId, toolName }) => {
        const result = await brokerComponentToolMcpCall(input.sql, {
          generationId,
          stableName,
          toolCallId: `tc_mcp_${generationId}_${String(requestId).replace(/[^a-zA-Z0-9_-]/g, "_")}`,
          props,
        });
        return {
          ...result,
          componentName: toolName,
        };
      },
    });

    return c.json(response);
  });
}
