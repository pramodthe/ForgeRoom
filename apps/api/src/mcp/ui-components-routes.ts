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
import {
  executeTaskRecordUpsertTool,
  TASK_RECORD_UPSERT_TOOL_DESCRIPTOR,
  TASK_RECORD_UPSERT_TOOL_NAME,
} from "../tasks";
import type { WorkspaceService } from "../workspace/service";

type SqlClient = ReturnType<typeof createSql>;

export function prepareTaskToolArguments(input: {
  channelId: string;
  rawArgs: Record<string, unknown>;
  provenance: { runId: string; sourceMessageId: string } | null;
}): { ok: true; args: Record<string, unknown> } | { ok: false; message: string } {
  if (input.rawArgs.channel_id !== input.channelId) {
    return { ok: false, message: "Task channel does not match the session channel." };
  }
  if (input.rawArgs.operation === "update") {
    return { ok: true, args: input.rawArgs };
  }
  if (input.rawArgs.operation !== "create") {
    return { ok: false, message: "Task operation must be create or update." };
  }
  if (
    input.rawArgs.task_id !== undefined &&
    input.rawArgs.task_id !== null &&
    input.rawArgs.task_id !== ""
  ) {
    return { ok: false, message: "Task creation must not include a task ID." };
  }
  if (!input.provenance) {
    return { ok: false, message: "No active run provenance for Task creation." };
  }
  if (
    (input.rawArgs.source_run_id !== undefined &&
      input.rawArgs.source_run_id !== null &&
      input.rawArgs.source_run_id !== input.provenance.runId) ||
    (input.rawArgs.source_message_id !== undefined &&
      input.rawArgs.source_message_id !== null &&
      input.rawArgs.source_message_id !== input.provenance.sourceMessageId)
  ) {
    return { ok: false, message: "Task provenance does not match the active run." };
  }
  const {
    task_id: _taskId,
    expected_revision: _expectedRevision,
    source_run_id: _sourceRunId,
    source_message_id: _sourceMessageId,
    ...createArgs
  } = input.rawArgs;
  return {
    ok: true,
    args: {
      ...createArgs,
      source_run_id: input.provenance.runId,
      source_message_id: input.provenance.sourceMessageId,
    },
  };
}

export async function loadActiveTaskToolProvenance(
  sql: SqlClient,
  generationId: string,
): Promise<{ runId: string; sourceMessageId: string } | null> {
  const rows = await sql<Array<{ run_id: string; source_message_id: string }>>`
    SELECT rs.run_id, r.source_message_id
    FROM agent_turns AS turn
    JOIN run_steps AS rs ON rs.id = turn.run_step_id
    JOIN runs AS r ON r.id = rs.run_id
    WHERE turn.session_generation_id = ${generationId}
      AND turn.state IN ('acquiring', 'creating', 'streaming', 'required_actions', 'resuming')
    ORDER BY turn.started_at DESC NULLS LAST, turn.id DESC
    LIMIT 1
  `;
  const row = rows[0];
  return row ? { runId: row.run_id, sourceMessageId: row.source_message_id } : null;
}

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
    workspace: WorkspaceService;
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
      additionalTools: context.offeredApplicationToolNames.includes(TASK_RECORD_UPSERT_TOOL_NAME)
        ? [
            {
              name: TASK_RECORD_UPSERT_TOOL_DESCRIPTOR.name,
              description: TASK_RECORD_UPSERT_TOOL_DESCRIPTOR.description,
              inputSchema: TASK_RECORD_UPSERT_TOOL_DESCRIPTOR.inputSchema,
            },
          ]
        : [],
      callAdditionalTool: async ({ toolName, arguments: rawArgs }) => {
        if (
          toolName !== TASK_RECORD_UPSERT_TOOL_NAME ||
          !context.offeredApplicationToolNames.includes(TASK_RECORD_UPSERT_TOOL_NAME)
        ) {
          return {
            content: [{ type: "text", text: "Application tool is not offered in this session." }],
            isError: true,
          };
        }
        const isCreate = rawArgs.operation === "create";
        const prepared = prepareTaskToolArguments({
          channelId: context.channelId,
          rawArgs,
          provenance: isCreate ? await loadActiveTaskToolProvenance(input.sql, generationId) : null,
        });
        if (!prepared.ok) {
          return {
            content: [{ type: "text", text: prepared.message }],
            isError: true,
          };
        }
        const result = await executeTaskRecordUpsertTool(
          input.workspace,
          context.coworkerId,
          prepared.args,
          {
            channelAgentSessionId: context.channelAgentSessionId,
            generationId: context.generationId,
            expectedGeneration: context.generation,
            workspaceId: context.workspaceId,
            channelId: context.channelId,
            coworkerId: context.coworkerId,
            applicationToolName: TASK_RECORD_UPSERT_TOOL_NAME,
          },
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          isError: !result.ok,
        };
      },
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
