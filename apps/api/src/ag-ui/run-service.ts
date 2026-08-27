import {
  buildAgUiCoworkerCapabilities,
  extractLatestUserMessageContent,
  formatAgUiSseEvent,
  parseUpstreamRunAgentInput,
  pollTrueForgeTurnEvents,
  TrueForgeAGUIAdapter,
} from "@forgeroom/ag-ui";
import type { SessionResponse } from "@forgeroom/contracts";
import type { createSql } from "@forgeroom/db";
import type { TrueForgeClient } from "@forgeroom/trueforge";
import type { WorkspaceService } from "../workspace/service";
import { bindDurableTrueForgeTurn } from "./bind-durable-turn";

export type AgUiRunServiceError = {
  code:
    | "not_found"
    | "forbidden"
    | "validation_failed"
    | "recipient_unavailable"
    | "provider_unavailable"
    | "conflict";
  message: string;
  details?: Record<string, unknown>;
};

export type AgUiRunBootstrap = {
  threadId: string;
  aguiRunId: string;
  applicationRunId: string;
  runStepId: string;
  agentTurnId: string;
  messageId: string;
  channelId: string;
  coworkerId: string;
  trueforgeSessionId: string;
  trueforgeTurnId: string;
};

export type AgUiRunService = {
  getCapabilities(
    session: SessionResponse,
    channelId: string,
    coworkerId: string,
  ): Promise<
    | { ok: true; value: ReturnType<typeof buildAgUiCoworkerCapabilities> }
    | { ok: false; error: AgUiRunServiceError }
  >;
  prepareRun(
    session: SessionResponse,
    channelId: string,
    coworkerId: string,
    body: unknown,
  ): Promise<{ ok: true; value: AgUiRunBootstrap } | { ok: false; error: AgUiRunServiceError }>;
  streamPreparedRun(
    bootstrap: AgUiRunBootstrap,
    write: (chunk: string) => Promise<void>,
  ): Promise<void>;
};

export function createAgUiRunService(options: {
  workspace: WorkspaceService;
  trueforgeClient?: TrueForgeClient;
  sql?: ReturnType<typeof createSql>;
}): AgUiRunService {
  const { workspace, trueforgeClient, sql } = options;

  return {
    async getCapabilities(session, channelId, coworkerId) {
      const resolved = await workspace.resolveAgUiCoworkerContext(session, channelId, coworkerId);
      if (!resolved.ok) {
        return {
          ok: false,
          error: {
            code: resolved.error.code as AgUiRunServiceError["code"],
            message: resolved.error.message,
            details:
              "details" in resolved.error
                ? (resolved.error.details as Record<string, unknown>)
                : undefined,
          },
        };
      }
      return {
        ok: true,
        value: buildAgUiCoworkerCapabilities({
          channelId,
          coworkerId,
          logicalThreadId: resolved.value.logicalThreadId,
        }),
      };
    },

    async prepareRun(session, channelId, coworkerId, body) {
      const parsedInput = parseUpstreamRunAgentInput(body);
      if (!parsedInput.ok) {
        return {
          ok: false,
          error: {
            code: "validation_failed",
            message:
              parsedInput.reason === "unsupported_in_p0"
                ? "RunAgentInput.resume is disabled in P0."
                : "Invalid RunAgentInput.",
            details: {
              capability: parsedInput.capability,
              reason: parsedInput.reason,
              issues: parsedInput.issues,
            },
          },
        };
      }

      const resolved = await workspace.resolveAgUiCoworkerContext(session, channelId, coworkerId);
      if (!resolved.ok) {
        return {
          ok: false,
          error: {
            code: resolved.error.code as AgUiRunServiceError["code"],
            message: resolved.error.message,
            details:
              "details" in resolved.error
                ? (resolved.error.details as Record<string, unknown>)
                : undefined,
          },
        };
      }

      const input = parsedInput.input;
      if (input.threadId !== resolved.value.logicalThreadId) {
        return {
          ok: false,
          error: {
            code: "validation_failed",
            message: "threadId must match the server-issued logical coworker thread ID.",
            details: {
              expected_thread_id: resolved.value.logicalThreadId,
              received_thread_id: input.threadId,
            },
          },
        };
      }

      const content = extractLatestUserMessageContent(input);
      if (!content) {
        return {
          ok: false,
          error: {
            code: "validation_failed",
            message: "RunAgentInput must include at least one non-empty user message.",
          },
        };
      }

      if (resolved.value.availability !== "available") {
        return {
          ok: false,
          error: {
            code: "recipient_unavailable",
            message: "Coworker is not available for a new AG-UI run.",
            details: { availability: resolved.value.availability },
          },
        };
      }

      if (!trueforgeClient || !sql || !resolved.value.trueforgeSessionId) {
        return {
          ok: false,
          error: {
            code: "provider_unavailable",
            message: "TrueForge runtime and SQL are required for AG-UI runs.",
          },
        };
      }

      const posted = await workspace.postMessage(session, channelId, {
        body: `@${resolved.value.coworker.handle} ${content}`,
        recipient_handles: [],
        routing_mode: "direct",
        parent_message_id: null,
        idempotency_key: `agui:${channelId}:${coworkerId}:${input.runId}`,
      });
      if (!posted.ok) {
        return {
          ok: false,
          error: {
            code: posted.error.code as AgUiRunServiceError["code"],
            message: posted.error.message,
            details:
              "details" in posted.error
                ? (posted.error.details as Record<string, unknown>)
                : undefined,
          },
        };
      }
      if (!posted.value.run_id || posted.value.run_step_ids.length !== 1) {
        return {
          ok: false,
          error: {
            code: "provider_unavailable",
            message: "AG-UI run persistence requires a single-coworker SQL-backed run.",
          },
        };
      }

      const runStepId = posted.value.run_step_ids[0]!;
      const bound = await bindDurableTrueForgeTurn({
        sql,
        trueforgeClient,
        runStepId,
        content,
        clientAguiRunId: input.runId,
      });
      if (!bound.ok) {
        return {
          ok: false,
          error: {
            code: "provider_unavailable",
            message: "Could not bind a durable TrueForge turn for the AG-UI run.",
            details: { reason: bound.reason },
          },
        };
      }

      return {
        ok: true,
        value: {
          threadId: resolved.value.logicalThreadId,
          aguiRunId: input.runId,
          applicationRunId: posted.value.run_id,
          runStepId,
          agentTurnId: bound.value.agentTurnId,
          messageId: posted.value.message_id,
          channelId,
          coworkerId,
          trueforgeSessionId: bound.value.trueforgeSessionId,
          trueforgeTurnId: bound.value.trueforgeTurnId,
        },
      };
    },

    async streamPreparedRun(bootstrap, write) {
      if (!trueforgeClient) {
        throw new Error("TrueForge runtime is not configured");
      }
      const adapter = new TrueForgeAGUIAdapter({
        channelId: bootstrap.channelId,
        coworkerId: bootstrap.coworkerId,
        logicalThreadId: bootstrap.threadId,
        aguiRunId: bootstrap.aguiRunId,
        applicationRunId: bootstrap.applicationRunId,
        runStepId: bootstrap.runStepId,
        agentTurnId: bootstrap.agentTurnId,
      });

      let wroteTerminal = false;
      const writeTerminalError = async (message: string) => {
        if (wroteTerminal) {
          return;
        }
        wroteTerminal = true;
        await write(
          formatAgUiSseEvent({
            type: "RUN_ERROR",
            threadId: bootstrap.threadId,
            runId: bootstrap.aguiRunId,
            message,
          }),
        );
      };

      try {
        await write(formatAgUiSseEvent(adapter.buildRunStarted()));
        const events = await pollTrueForgeTurnEvents({
          adapter,
          sessionId: bootstrap.trueforgeSessionId,
          turnId: bootstrap.trueforgeTurnId,
          listEvents: async (sessionId, turnId) => {
            const rows = await trueforgeClient.listTurnEvents(sessionId, turnId);
            return rows as Array<Record<string, unknown>>;
          },
        });
        for (const event of events) {
          await write(formatAgUiSseEvent(event));
          if (event.type === "RUN_FINISHED" || event.type === "RUN_ERROR") {
            wroteTerminal = true;
          }
        }
        if (!wroteTerminal) {
          await writeTerminalError("Timed out waiting for a terminal AG-UI run event.");
        }
      } catch (error) {
        await writeTerminalError(
          error instanceof Error ? error.message : "AG-UI run stream failed.",
        );
      }
    },
  };
}
