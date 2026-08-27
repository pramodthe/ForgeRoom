import {
  buildAgUiCoworkerCapabilities,
  extractExistingRunBinding,
  extractLatestUserMessageContent,
  formatAgUiSseEvent,
  parseUpstreamRunAgentInput,
  pollTrueForgeTurnEvents,
  TrueForgeAGUIAdapter,
  toPersistedAgUiEvent,
} from "@forgeroom/ag-ui";
import type { SessionResponse } from "@forgeroom/contracts";
import { ingestNormalizedTrueForgeEvent, type createSql } from "@forgeroom/db";
import { evaluateTurnDoneOutcome, normalizeTrueForgeEvent } from "@forgeroom/orchestration";
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
    options?: { isDeliveryAuthorized?: () => Promise<boolean> },
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

      const existingBinding = extractExistingRunBinding(input);
      if (existingBinding) {
        const rows = await sql<
          {
            application_run_id: string;
            source_message_id: string;
            channel_id: string;
            message_body: string;
            run_step_id: string;
            assigned_agent_id: string;
            logical_agui_thread_id: string;
          }[]
        >`
          SELECT
            r.id AS application_run_id,
            r.source_message_id,
            m.channel_id,
            m.body AS message_body,
            rs.id AS run_step_id,
            rs.assigned_agent_id,
            cas.logical_agui_thread_id
          FROM runs r
          JOIN messages m ON m.id = r.source_message_id
          JOIN run_steps rs ON rs.run_id = r.id
          JOIN turn_queue_items tqi ON tqi.run_step_id = rs.id
          JOIN channel_agent_sessions cas ON cas.id = tqi.channel_agent_session_id
          WHERE r.id = ${existingBinding.applicationRunId}
            AND r.source_message_id = ${existingBinding.sourceMessageId}
            AND rs.id = ${existingBinding.runStepId}
          LIMIT 1
        `;
        const existing = rows[0];
        if (
          !existing ||
          existing.channel_id !== channelId ||
          existing.assigned_agent_id !== coworkerId ||
          existing.logical_agui_thread_id !== input.threadId ||
          existing.message_body !== content
        ) {
          return {
            ok: false,
            error: {
              code: "validation_failed",
              message: "Existing ForgeRoom run binding does not match this channel turn.",
            },
          };
        }

        const bound = await bindDurableTrueForgeTurn({
          sql,
          trueforgeClient,
          runStepId: existing.run_step_id,
          content,
          clientAguiRunId: input.runId,
        });
        if (!bound.ok) {
          return {
            ok: false,
            error: {
              code: "provider_unavailable",
              message: "Could not bind a durable TrueForge turn for the existing AG-UI run.",
              details: { reason: bound.reason },
            },
          };
        }

        return {
          ok: true,
          value: {
            threadId: resolved.value.logicalThreadId,
            aguiRunId: bound.value.aguiRunId,
            applicationRunId: existing.application_run_id,
            runStepId: existing.run_step_id,
            agentTurnId: bound.value.agentTurnId,
            messageId: existing.source_message_id,
            channelId,
            coworkerId,
            trueforgeSessionId: bound.value.trueforgeSessionId,
            trueforgeTurnId: bound.value.trueforgeTurnId,
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
          aguiRunId: bound.value.aguiRunId,
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

    async streamPreparedRun(bootstrap, write, streamOptions) {
      if (!trueforgeClient) {
        throw new Error("TrueForge runtime is not configured");
      }
      if (!sql) {
        throw new Error("SQL is required for durable AG-UI streaming");
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

      let observedTerminal = false;
      let deliveryAuthorized = true;
      let durableMirrorHealthy = true;
      const canDeliver = async () => {
        if (!deliveryAuthorized) {
          return false;
        }
        if (!streamOptions?.isDeliveryAuthorized) {
          return true;
        }
        try {
          deliveryAuthorized = await streamOptions.isDeliveryAuthorized();
        } catch {
          deliveryAuthorized = false;
        }
        return deliveryAuthorized;
      };
      const writeEvent = async (event: Record<string, unknown>) => {
        const durableEvent = toPersistedAgUiEvent(event);
        if (durableEvent && durableMirrorHealthy) {
          const mirrored = await workspace.appendCoworkerAgUiEvent({
            channelId: bootstrap.channelId,
            coworkerId: bootstrap.coworkerId,
            logicalThreadId: bootstrap.threadId,
            applicationRunId: bootstrap.applicationRunId,
            runStepId: bootstrap.runStepId,
            agentTurnId: bootstrap.agentTurnId,
            aguiRunId: bootstrap.aguiRunId,
            sourceMessageId: bootstrap.messageId,
            event: durableEvent,
          });
          if (!mirrored.ok) {
            // Channel mirror outage must not abort provider ingestion or lifecycle settlement.
            durableMirrorHealthy = false;
          }
        }
        if (await canDeliver()) {
          await write(formatAgUiSseEvent(event));
        }
      };
      const writeTerminalError = async (message: string) => {
        if (observedTerminal) {
          return;
        }
        observedTerminal = true;
        for (const event of adapter.buildRunError(message)) {
          if (durableMirrorHealthy) {
            await writeEvent(event);
          } else if (await canDeliver()) {
            await write(formatAgUiSseEvent(event));
          }
        }
      };

      try {
        await writeEvent(adapter.buildRunStarted());
        await pollTrueForgeTurnEvents({
          adapter,
          sessionId: bootstrap.trueforgeSessionId,
          turnId: bootstrap.trueforgeTurnId,
          listEvents: async (sessionId, turnId) => {
            const rows = await trueforgeClient.listTurnEvents(sessionId, turnId);
            return rows as Array<Record<string, unknown>>;
          },
          onUpstreamEvent: async (raw) => {
            const normalized = normalizeTrueForgeEvent(raw);
            const turnDoneOutcome =
              normalized.normalizedType === "turn.done"
                ? evaluateTurnDoneOutcome(normalized.payloadRedacted)
                : null;
            const ingested = await ingestNormalizedTrueForgeEvent(sql, {
              agentTurnId: bootstrap.agentTurnId,
              expectedTurnStates: [
                "creating",
                "streaming",
                "required_actions",
                "completed",
                "failed",
              ],
              event: normalized,
              turnDoneOutcome,
            });
            if (!ingested.ok) {
              throw new Error("Durable TrueForge event ingestion failed");
            }
          },
          onEvent: async (event) => {
            if (event.type === "RUN_FINISHED" || event.type === "RUN_ERROR") {
              observedTerminal = true;
            }
            await writeEvent(event);
          },
        });
        if (!observedTerminal) {
          await writeTerminalError("Timed out waiting for a terminal AG-UI run event.");
        }
      } catch {
        await writeTerminalError("AG-UI run failed while reading provider events.");
      }
    },
  };
}
