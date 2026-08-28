import { createHash } from "node:crypto";
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
import { canonicalizeJson } from "@forgeroom/domain";
import type { ApiEnv } from "../env";
import { errorResponse } from "../http";

type SqlClient = ReturnType<typeof createSql>;

export function buildMcpToolCallId(input: {
  generationId: string;
  requestId: string | number;
  toolName: string;
  stableName: string;
  props: Record<string, unknown>;
}): string {
  const fingerprint = canonicalizeJson({
    request_id_type: typeof input.requestId,
    request_id: input.requestId,
    tool_name: input.toolName,
    stable_name: input.stableName,
    props: input.props,
  });
  const digest = createHash("sha256").update(fingerprint, "utf8").digest("hex");
  return `tc_mcp_${input.generationId}_${digest}`;
}

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
          toolCallId: buildMcpToolCallId({
            generationId,
            requestId,
            toolName,
            stableName,
            props,
          }),
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
