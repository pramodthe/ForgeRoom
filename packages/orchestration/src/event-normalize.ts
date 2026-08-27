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
      runStepState: "awaiting_approval" | "awaiting_input" | "blocked_connection";
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

function readSafeString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function projectRequiredActions(value: unknown): Array<{ type: string }> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const type = readSafeString((item as { type?: unknown }).type);
    return type ? [{ type }] : [];
  });
}

/**
 * Persist only the event fields needed for lifecycle projection and safe text.
 * Provider event/session/turn/thread/action IDs remain in typed correlation
 * columns and arbitrary tool/provider bodies never enter normalized JSON.
 */
function projectNormalizedPayload(raw: Record<string, unknown>, type: string) {
  const payload: Record<string, unknown> = { type };
  const textEvent =
    type === "model.message.start" ||
    type === "assistant.message.start" ||
    type === "message.start" ||
    type === "model.message.delta" ||
    type === "assistant.message.delta" ||
    type === "message.delta" ||
    type === "model.output.delta" ||
    type === "model.message.end" ||
    type === "assistant.message.end" ||
    type === "message.end" ||
    type === "assistant.message.done";
  if (textEvent) {
    for (const key of ["text", "delta", "content", "message"] as const) {
      const value = readSafeString(raw[key]);
      if (value) {
        payload[key] = value;
      }
    }
  }

  const state =
    raw.state && typeof raw.state === "object" && !Array.isArray(raw.state)
      ? (raw.state as Record<string, unknown>)
      : null;
  const status = readSafeString(state?.status) ?? readSafeString(raw.status);
  if (status) {
    payload.status = status;
  }
  const requiredActions = projectRequiredActions(
    state?.required_actions ??
      state?.requiredActions ??
      raw.required_actions ??
      raw.requiredActions,
  );
  if (type === "turn.done" || requiredActions.length > 0) {
    payload.state = {
      ...(status ? { status } : {}),
      required_actions: requiredActions,
    };
  }
  return payload;
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
  return {
    trueforgeEventId: id,
    normalizedType: type,
    threadId,
    sequenceNumber,
    payloadRedacted: projectNormalizedPayload(raw, type),
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
    const types = required.map((item) =>
      item && typeof item === "object"
        ? String((item as { type?: unknown }).type ?? "").toLowerCase()
        : "",
    );
    const hasConnection = types.some(
      (type) =>
        type.includes("connection") ||
        type.includes("auth_required") ||
        type.includes("mcp.auth"),
    );
    const hasApproval = types.some((type) => type.includes("approval"));
    return {
      kind: "required_actions",
      agentTurnState: "required_actions",
      runStepState: hasConnection
        ? "blocked_connection"
        : hasApproval
          ? "awaiting_approval"
          : "awaiting_input",
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
