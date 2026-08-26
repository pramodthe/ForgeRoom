import {
  agentChannelEnvelopeSchema,
  messageCreatedRoutingPayloadSchema,
  type AgentChannelEnvelope,
} from "@forgeroom/contracts";
import { buildEnvelope, customAguiEvent } from "./event-builders";
import type { ChannelEventRecord } from "./store";

export const DEFAULT_EVENT_PAGE_SIZE = 500;
export const MAX_EVENT_PAGE_SIZE = 1000;

/**
 * Convert a stored channel_events row into a schema-valid envelope.
 * Legacy P0-106 rows stored message audit JSON (not AgentChannelEnvelope) in payload_json —
 * reconstruct when possible; otherwise return null so readers can skip safely.
 */
export function envelopeFromStoredEvent(
  row: ChannelEventRecord,
  options?: { sourceMessageId?: string | null },
): AgentChannelEnvelope | null {
  const direct = agentChannelEnvelopeSchema.safeParse(row.payloadJson);
  if (direct.success) {
    return direct.data;
  }

  if (row.aguiEventJson) {
    const withAgui = agentChannelEnvelopeSchema.safeParse({
      schemaVersion: 1,
      channelId: row.channelId,
      channelSequence: row.sequence,
      actorKind: row.actorType,
      ...(row.runId ? { applicationRunId: row.runId } : {}),
      ...(row.logicalThreadId ? { logicalThreadId: row.logicalThreadId } : {}),
      ...(options?.sourceMessageId ? { sourceMessageId: options.sourceMessageId } : {}),
      aguiEvent: row.aguiEventJson,
    });
    if (withAgui.success) {
      return withAgui.data;
    }
  }

  // Legacy message.created: payload was { body, recipient_handles, routing_mode }.
  if (row.type === "message.created" && (row.actorType === "human" || row.actorType === "system")) {
    const payload = row.payloadJson;
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const routing = messageCreatedRoutingPayloadSchema.safeParse({
        schemaVersion: 1,
        routing_mode: (payload as { routing_mode?: unknown }).routing_mode,
        recipient_handles: (payload as { recipient_handles?: unknown }).recipient_handles,
      });
      if (routing.success) {
        return buildEnvelope(row.sequence, {
          channelId: row.channelId,
          actorKind: row.actorType === "human" ? "human" : "system",
          sourceMessageId: options?.sourceMessageId ?? undefined,
          aguiEvent: {
            type: "CUSTOM",
            name: "message.created",
            payload: routing.data,
          },
        });
      }
    }
    return null;
  }

  // Legacy channel/participant source names with non-envelope payloads.
  const customNames = new Set([
    "channel.created",
    "channel.renamed",
    "channel.archived",
    "participant.added",
    "participant.removed",
  ]);
  if (customNames.has(row.type) && row.actorType !== "coworker") {
    try {
      return buildEnvelope(row.sequence, {
        channelId: row.channelId,
        actorKind: row.actorType === "human" ? "human" : "system",
        aguiEvent: customAguiEvent(
          row.type as
            | "channel.created"
            | "channel.renamed"
            | "channel.archived"
            | "participant.added"
            | "participant.removed",
        ),
      });
    } catch {
      return null;
    }
  }

  return null;
}

export function clampEventLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_EVENT_PAGE_SIZE;
  }
  const n = Math.floor(limit);
  if (n < 1) return 1;
  return Math.min(n, MAX_EVENT_PAGE_SIZE);
}
