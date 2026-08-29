import { createHash } from "node:crypto";
import type { PreviousTurnIdInput, TrueForgeTurn, TurnInputItem } from "@forgeroom/trueforge";
import { hashTurnCreateIntent } from "./turn-creation";

/** Canonical response item for one resolved RequiredAction (pre-encrypt). */
export type PauseResumeResponseItem =
  | {
      kind: "approval";
      requiredActionId: string;
      providerActionId: string;
      threadId: string;
      toolCallId: string;
      approval: { status: "allow" } | { status: "deny"; reason?: string };
    }
  | {
      kind: "question";
      requiredActionId: string;
      providerActionId: string;
      threadId: string;
      toolCallId: string;
      content: string;
    };

export type BuildResponseOnlyTurnInputArgs = {
  applicationRunToken: string;
  previousTrueforgeTurnId: string;
  responses: PauseResumeResponseItem[];
};

export type AgUiResumeInterrupt = {
  interruptId: string;
  status?: "resolved" | "cancelled";
  payload?: unknown;
};

/**
 * Build TrueForge createTurn input containing only approval/tool-response items.
 * Never includes user.message (AP-010).
 */
export function buildResponseOnlyTurnInput(args: BuildResponseOnlyTurnInputArgs): {
  input: TurnInputItem[];
  previousTurnId: PreviousTurnIdInput;
  inputHash: string;
  responsePayloadHash: string;
  redactedSummary: Array<Record<string, unknown>>;
} {
  if (args.responses.length === 0) {
    throw new Error("response-only resume requires at least one response item");
  }

  const ordered = [...args.responses].sort((a, b) =>
    a.requiredActionId.localeCompare(b.requiredActionId),
  );

  const input: TurnInputItem[] = ordered.map((item) => {
    if (item.kind === "approval") {
      return {
        type: "user.tool_approval",
        thread_id: item.threadId,
        tool_call_id: item.toolCallId,
        approval: item.approval,
      };
    }
    return {
      type: "user.tool_response",
      thread_id: item.threadId,
      tool_call_id: item.toolCallId,
      content: item.content,
    };
  });

  assertResponseOnlyNoNormalMessage(input);

  const previousTurnId: PreviousTurnIdInput = args.previousTrueforgeTurnId;
  const inputHash = hashTurnCreateIntent({ input, previousTurnId });
  // Include application token in the durable payload hash so intents stay distinct
  // even when TrueForge history cannot carry a user.message marker.
  const responsePayloadHash = hashCanonicalPayload({
    application_run_token: args.applicationRunToken,
    previous_turn_id: previousTurnId,
    input,
  });

  const redactedSummary = ordered.map((item) => {
    if (item.kind === "approval") {
      return {
        kind: "approval",
        required_action_id: item.requiredActionId,
        provider_action_id: item.providerActionId,
        tool_call_id: item.toolCallId,
        approval_status: item.approval.status,
      };
    }
    return {
      kind: "question",
      required_action_id: item.requiredActionId,
      provider_action_id: item.providerActionId,
      tool_call_id: item.toolCallId,
      content_length: item.content.length,
    };
  });

  return { input, previousTurnId, inputHash, responsePayloadHash, redactedSummary };
}

export function assertResponseOnlyNoNormalMessage(input: TurnInputItem[]): void {
  for (const item of input) {
    if (!item || typeof item !== "object") {
      throw new Error("invalid response-only turn item");
    }
    const type = (item as { type?: unknown }).type;
    if (type === "user.message") {
      throw new Error("response-only resume cannot include a normal user.message");
    }
    if (type !== "user.tool_approval" && type !== "user.tool_response") {
      throw new Error(`unsupported response-only turn item type: ${String(type)}`);
    }
  }
}

export type ResponseTurnCreateOrReconcileDecision =
  | { action: "bind_existing"; turn: TrueForgeTurn; matchedBy: "input_hash" }
  | { action: "create_new" }
  | { action: "fail_closed"; reason: "ambiguous_history" };

/**
 * Uncertain response-only creates reconcile by predecessor + input hash only.
 * Never blind-create a second resume turn.
 */
export function decideCreateOrReconcileResponseTurn(args: {
  localTrueforgeTurnId: string | null;
  history: TrueForgeTurn[];
  inputHash: string;
  previousTurnId: PreviousTurnIdInput;
}): ResponseTurnCreateOrReconcileDecision {
  if (args.localTrueforgeTurnId) {
    const existing = args.history.find((turn) => turn.id === args.localTrueforgeTurnId);
    if (existing) {
      return { action: "bind_existing", turn: existing, matchedBy: "input_hash" };
    }
  }

  const expectedPrevious = args.previousTurnId === "none" ? null : args.previousTurnId;
  const matches = args.history.filter((turn) => {
    if (turn.previous_turn_id !== expectedPrevious) {
      return false;
    }
    const hash = hashTurnCreateIntent({
      input: turn.input ?? [],
      previousTurnId: turn.previous_turn_id === null ? "none" : turn.previous_turn_id,
    });
    return hash === args.inputHash;
  });

  if (matches.length > 1) {
    return { action: "fail_closed", reason: "ambiguous_history" };
  }
  if (matches.length === 1) {
    return { action: "bind_existing", turn: matches[0]!, matchedBy: "input_hash" };
  }
  return { action: "create_new" };
}

/**
 * Validate AG-UI resume interrupts against a PauseGroup's RequiredActions.
 * Rejects forged interrupt IDs and any client payload that tries to supply decisions.
 */
export function authorizeAgUiPauseGroupResume(input: {
  resume: AgUiResumeInterrupt[];
  /** Each durable RequiredAction id and its provider alias identify one canonical action. */
  actionAliases: Array<{ requiredActionId: string; providerActionId: string }>;
  requiredActionCount: number;
  pauseGroupReady: boolean;
  pauseGroupExpired?: boolean;
}):
  | { ok: true }
  | {
      ok: false;
      reason:
        | "empty_resume"
        | "incomplete_group"
        | "forged_interrupt"
        | "partial_resume"
        | "payload_bypass"
        | "expired"
        | "cancelled_interrupt";
    } {
  if (input.pauseGroupExpired) {
    return { ok: false, reason: "expired" };
  }
  if (!input.pauseGroupReady) {
    return { ok: false, reason: "incomplete_group" };
  }
  if (input.resume.length === 0) {
    return { ok: false, reason: "empty_resume" };
  }

  if (input.actionAliases.length !== input.requiredActionCount) {
    return { ok: false, reason: "incomplete_group" };
  }
  const canonicalByAlias = new Map<string, string>();
  for (const action of input.actionAliases) {
    for (const alias of [action.requiredActionId, action.providerActionId]) {
      const existing = canonicalByAlias.get(alias);
      if (existing && existing !== action.requiredActionId) {
        // An alias that identifies two actions is not safe to authorize.
        return { ok: false, reason: "forged_interrupt" };
      }
      canonicalByAlias.set(alias, action.requiredActionId);
    }
  }
  const seenCanonicalActions = new Set<string>();
  for (const item of input.resume) {
    if (item.status === "cancelled") {
      return { ok: false, reason: "cancelled_interrupt" };
    }
    const canonicalActionId = canonicalByAlias.get(item.interruptId);
    if (!canonicalActionId) {
      return { ok: false, reason: "forged_interrupt" };
    }
    if (seenCanonicalActions.has(canonicalActionId)) {
      return { ok: false, reason: "forged_interrupt" };
    }
    seenCanonicalActions.add(canonicalActionId);
    if (item.payload !== undefined && item.payload !== null) {
      if (hasDecisionBypassPayload(item.payload)) {
        return { ok: false, reason: "payload_bypass" };
      }
    }
  }
  // Must cover every RequiredAction exactly once (ids may be provider or durable).
  if (seenCanonicalActions.size !== input.requiredActionCount) {
    return { ok: false, reason: "partial_resume" };
  }
  return { ok: true };
}

function hasDecisionBypassPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return true;
  }
  const record = payload as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0) {
    return false;
  }
  const forbidden = [
    "decision",
    "approval",
    "status",
    "allow",
    "deny",
    "answer",
    "content",
    "arguments",
    "toolArguments",
  ];
  return keys.some((key) => forbidden.includes(key));
}

function hashCanonicalPayload(value: unknown): string {
  return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
}

/** Default recovery window after confirmed resume before ciphertext wipe (24h). */
export const PAUSE_CIPHERTEXT_RECOVERY_WINDOW_MS = 24 * 60 * 60 * 1000;

export function ciphertextExpiryAt(
  completedAtIso: string,
  nowIso?: string,
): {
  expiresAt: string;
  expired: boolean;
} {
  const completedMs = Date.parse(completedAtIso);
  const expiresAt = new Date(completedMs + PAUSE_CIPHERTEXT_RECOVERY_WINDOW_MS).toISOString();
  const nowMs = Date.parse(nowIso ?? new Date().toISOString());
  return { expiresAt, expired: nowMs >= Date.parse(expiresAt) };
}
