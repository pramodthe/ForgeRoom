import { p0PersistedAguiEventSchema, type P0PersistedAguiEvent } from "@forgeroom/contracts";

function stringField(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
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
  }

  const parsed = p0PersistedAguiEventSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
