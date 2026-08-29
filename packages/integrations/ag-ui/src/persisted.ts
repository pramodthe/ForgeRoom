import { p0PersistedAguiEventSchema, type P0PersistedAguiEvent } from "@forgeroom/contracts";

function stringField(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberField(input: Record<string, unknown>, key: string): number | undefined {
  const value = input[key];
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function readForgeRoomMeta(event: Record<string, unknown>): Record<string, unknown> | null {
  const metadata = event.metadata;
  if (!metadata || typeof metadata !== "object") return null;
  const forgeroom = (metadata as Record<string, unknown>).forgeroom;
  if (!forgeroom || typeof forgeroom !== "object") return null;
  return forgeroom as Record<string, unknown>;
}

function resolveStateKind(
  event: Record<string, unknown>,
  meta: Record<string, unknown> | null,
): "channel" | "thread" | undefined {
  const direct = event.stateKind ?? meta?.stateKind;
  if (direct === "channel" || direct === "thread") return direct;
  const actorKind = meta?.actorKind;
  if (actorKind === "system") return "channel";
  if (actorKind === "coworker") return "thread";
  return undefined;
}

function resolveBaseRevision(
  event: Record<string, unknown>,
  meta: Record<string, unknown> | null,
): number | undefined {
  return numberField(event, "revision") ?? (meta ? numberField(meta, "revision") : undefined);
}

function isPatchOp(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && typeof (value as { op?: unknown }).op === "string";
}

/**
 * Project an upstream AG-UI event into the deliberately small durable channel allowlist.
 * Provider metadata, reasoning, arbitrary payloads and interrupt response schemas never cross it.
 */
export function toPersistedAgUiEvent(input: unknown): P0PersistedAguiEvent | null {
  if (!input || typeof input !== "object") return null;
  const event = input as Record<string, unknown>;
  const type = stringField(event, "type");
  let candidate: unknown = null;

  if (type === "RUN_STARTED") {
    candidate = {
      type,
      threadId: stringField(event, "threadId"),
      runId: stringField(event, "runId"),
    };
  } else if (type === "RUN_ERROR") {
    candidate = {
      type,
      threadId: stringField(event, "threadId"),
      runId: stringField(event, "runId"),
      message: stringField(event, "message"),
      ...(stringField(event, "code") ? { code: stringField(event, "code") } : {}),
    };
  } else if (type === "RUN_FINISHED") {
    const outcome = event.outcome;
    if (!outcome || typeof outcome !== "object") return null;
    const outcomeRecord = outcome as Record<string, unknown>;
    if (outcomeRecord.type === "success") {
      candidate = {
        type,
        threadId: stringField(event, "threadId"),
        runId: stringField(event, "runId"),
        outcome: { type: "success" },
      };
    } else if (outcomeRecord.type === "interrupt" && Array.isArray(outcomeRecord.interrupts)) {
      const interrupts = outcomeRecord.interrupts.flatMap((interrupt) => {
        if (!interrupt || typeof interrupt !== "object") return [];
        const record = interrupt as Record<string, unknown>;
        const id = stringField(record, "id");
        const reason = stringField(record, "reason");
        if (!id || !reason) return [];
        const message = stringField(record, "message");
        return [{ id, reason, ...(message ? { message } : {}) }];
      });
      candidate = {
        type,
        threadId: stringField(event, "threadId"),
        runId: stringField(event, "runId"),
        outcome: { type: "interrupt", interrupts },
      };
    }
  } else if (type === "TEXT_MESSAGE_START") {
    candidate = {
      type,
      messageId: stringField(event, "messageId"),
      role: event.role,
      ...(stringField(event, "name") ? { name: stringField(event, "name") } : {}),
    };
  } else if (type === "TEXT_MESSAGE_CONTENT") {
    candidate = {
      type,
      messageId: stringField(event, "messageId"),
      delta: stringField(event, "delta"),
    };
  } else if (type === "TEXT_MESSAGE_END") {
    candidate = { type, messageId: stringField(event, "messageId") };
  } else if (type === "STATE_SNAPSHOT") {
    candidate = {
      type,
      snapshot: event.snapshot,
    };
  } else if (type === "STATE_DELTA") {
    const meta = readForgeRoomMeta(event);
    const stateKind = resolveStateKind(event, meta);
    const revision = resolveBaseRevision(event, meta);

    if (Array.isArray(event.patch) && stateKind && revision !== undefined) {
      candidate = {
        type,
        stateKind,
        revision,
        patch: event.patch,
      };
    } else if (Array.isArray(event.delta) && stateKind && revision !== undefined) {
      if (!event.delta.every(isPatchOp)) {
        candidate = null;
      } else {
        const ops = event.delta.filter((operation) => operation.path !== "/revision");
        candidate = {
          type,
          stateKind,
          revision,
          patch: [
            { op: "test", path: "/revision", value: revision },
            ...ops,
            { op: "replace", path: "/revision", value: revision + 1 },
          ],
        };
      }
    }
  } else if (type === "ACTIVITY_SNAPSHOT") {
    candidate = {
      type,
      messageId: stringField(event, "messageId"),
      activityType: event.activityType,
      replace: event.replace,
      content: event.content,
    };
  } else if (type === "ACTIVITY_DELTA") {
    candidate = {
      type,
      messageId: stringField(event, "messageId"),
      activityType: event.activityType,
      patch: event.patch,
    };
  } else if (type === "MESSAGES_SNAPSHOT") {
    candidate = {
      type,
      messages: event.messages,
    };
  } else if (type === "TOOL_CALL_START") {
    candidate = {
      type,
      toolCallId: stringField(event, "toolCallId"),
      toolCallName: stringField(event, "toolCallName"),
      ...(stringField(event, "parentMessageId")
        ? { parentMessageId: stringField(event, "parentMessageId") }
        : {}),
    };
  } else if (type === "TOOL_CALL_ARGS") {
    candidate = {
      type,
      toolCallId: stringField(event, "toolCallId"),
      delta: stringField(event, "delta"),
    };
  } else if (type === "TOOL_CALL_END") {
    candidate = {
      type,
      toolCallId: stringField(event, "toolCallId"),
    };
  } else if (type === "TOOL_CALL_RESULT") {
    candidate = {
      type,
      messageId: stringField(event, "messageId"),
      toolCallId: stringField(event, "toolCallId"),
      content: typeof event.content === "string" ? event.content : "",
      ...(event.role === "tool" ? { role: "tool" as const } : {}),
    };
  }

  const parsed = p0PersistedAguiEventSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
