import { isForbiddenPayloadKey } from "@forgeroom/contracts";

export type NormalizedRunEvent = {
  trueforgeEventId: string;
  normalizedType: string;
  threadId: string | null;
  sequenceNumber: number | null;
  payloadRedacted: Record<string, unknown>;
};

export type TurnDoneOutcome =
  | {
      kind: "required_actions";
      agentTurnState: "required_actions";
      runStepState: "awaiting_approval" | "awaiting_input";
      requiredActionCount: number;
    }
  | {
      kind: "terminal_success";
      agentTurnState: "completed";
      runStepState: "completed";
      requiredActionCount: 0;
    };

/** Recursively strip forbidden keys (credentials, reasoning, signatures, raw bodies). */
export function redactSensitiveFields(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveFields(item));
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (isForbiddenPayloadKey(key)) {
      continue;
    }
    out[key] = redactSensitiveFields(item);
  }
  return out;
}

export function normalizeTrueForgeEvent(raw: Record<string, unknown>): NormalizedRunEvent {
  const type = typeof raw.type === "string" ? raw.type : "unknown";
  const id = typeof raw.id === "string" ? raw.id : "";
  if (!id) {
    throw new Error("TrueForge event missing id");
  }
  const sequenceNumber =
    typeof raw.sequence_number === "number"
      ? raw.sequence_number
      : typeof raw.sequenceNumber === "number"
        ? raw.sequenceNumber
        : null;
  const threadId =
    typeof raw.thread_id === "string"
      ? raw.thread_id
      : typeof raw.threadId === "string"
        ? raw.threadId
        : null;
  const redacted = redactSensitiveFields(raw);
  return {
    trueforgeEventId: id,
    normalizedType: type,
    threadId,
    sequenceNumber,
    payloadRedacted:
      redacted && typeof redacted === "object" && !Array.isArray(redacted)
        ? (redacted as Record<string, unknown>)
        : { type, id },
  };
}

/**
 * Inspect complete required_actions collection — never terminalize on event name alone.
 * Accepts both snake_case wire and camelCase product shapes.
 */
export function evaluateTurnDoneOutcome(payload: Record<string, unknown>): TurnDoneOutcome {
  const state =
    payload.state && typeof payload.state === "object"
      ? (payload.state as Record<string, unknown>)
      : payload;
  const required =
    (Array.isArray(state.required_actions) ? state.required_actions : null) ??
    (Array.isArray(state.requiredActions) ? state.requiredActions : null) ??
    [];
  if (required.length > 0) {
    const hasApproval = required.some(
      (item) =>
        item &&
        typeof item === "object" &&
        String((item as { type?: unknown }).type ?? "").includes("approval"),
    );
    return {
      kind: "required_actions",
      agentTurnState: "required_actions",
      runStepState: hasApproval ? "awaiting_approval" : "awaiting_input",
      requiredActionCount: required.length,
    };
  }
  return {
    kind: "terminal_success",
    agentTurnState: "completed",
    runStepState: "completed",
    requiredActionCount: 0,
  };
}
