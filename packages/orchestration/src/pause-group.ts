import { createHash } from "node:crypto";
import { isForbiddenPayloadKey } from "@forgeroom/contracts";
import type { TurnQueueInputType } from "./turn-queue";

/** Raw TrueForge required-action item before application capture. */
export type RawRequiredAction = Record<string, unknown>;

export type CapturedActionType = "approval" | "question" | "connection";

export type ApprovalRedactionResult = {
  observedDescriptorHash: string;
  riskClass: "low" | "medium" | "high";
  redactedArguments: Record<string, unknown>;
  argumentsHash: string;
  redactedTarget: Record<string, unknown>;
  targetHash: string;
  expectedEffect: string;
};

export type ApprovalRedactionAdapter = {
  redactApproval: (toolName: string, args: unknown) => ApprovalRedactionResult;
};

export type ActingIdentityJson = {
  service: string;
  account_display: string;
  principal_type: "user" | "service_account" | "application" | "bot";
  principal_display: string;
  principal_id_hash: string;
};

export type PauseGroupCaptureAction =
  | {
      actionType: "approval";
      providerActionId: string;
      toolCallId: string;
      toolName: string;
      payloadRedacted: Record<string, unknown>;
      payloadHash: string;
      proposal: {
        toolCallId: string;
        toolName: string;
        observedDescriptorHash: string;
        riskClass: "low" | "medium" | "high";
        expectedEffect: string;
        normalizedArgumentsRedacted: Record<string, unknown>;
        argumentsHash: string;
        targetRedacted: Record<string, unknown>;
        targetHash: string;
        artifactRevisionHash: string | null;
        providerIdempotencyKey: string | null;
      };
    }
  | {
      actionType: "question";
      providerActionId: string;
      payloadRedacted: Record<string, unknown>;
      payloadHash: string;
      promptRedacted: Record<string, unknown>;
      promptHash: string;
    }
  | {
      actionType: "connection";
      providerActionId: string;
      payloadRedacted: Record<string, unknown>;
      payloadHash: string;
    };

export type PauseGroupCapturePlan = {
  generation: number;
  trueforgeTurnId: string;
  actions: PauseGroupCaptureAction[];
  runStepState: "awaiting_approval" | "awaiting_input" | "blocked_connection";
  rejectedChildCount: number;
};

export type PauseGroupCaptureFailure =
  | { ok: false; reason: "empty_required_actions" }
  | { ok: false; reason: "unexpected_child_only" }
  | { ok: false; reason: "unsupported_action"; providerActionId: string; type: string }
  | { ok: false; reason: "missing_provider_action_id" }
  | { ok: false; reason: "duplicate_provider_action_id"; providerActionId: string }
  | { ok: false; reason: "approval_missing_tool"; providerActionId: string }
  | { ok: false; reason: "approval_redaction_failed"; providerActionId: string; message: string };

function readSafeString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

const REDACTED_PROVIDER_TEXT = "[REDACTED]";
const PROVIDER_TEXT_SECRET_PATTERNS = [
  /\b(?:sk|sk-proj)-[A-Za-z0-9_-]{12,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{12,}\b/gi,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/gi,
  /\bglpat-[A-Za-z0-9_-]{20,}\b/g,
  /\bnpm_[A-Za-z0-9]{30,}\b/g,
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/gi,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*(?:["'][^"']+["']|[^\s,;]+)/gi,
] as const;

function redactProviderString(value: string): string {
  return PROVIDER_TEXT_SECRET_PATTERNS.reduce(
    (redacted, pattern) => redacted.replace(pattern, REDACTED_PROVIDER_TEXT),
    value,
  );
}

/**
 * Explicitly redact untrusted provider-authored question/connection text before persistence.
 * Key filtering alone is insufficient because providers may embed credentials in free text.
 */
export function redactProviderRequiredActionText(value: unknown): unknown {
  if (typeof value === "string") return redactProviderString(value);
  if (Array.isArray(value)) return value.map(redactProviderRequiredActionText);
  if (!value || typeof value !== "object") return value;

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = isForbiddenPayloadKey(key)
      ? REDACTED_PROVIDER_TEXT
      : redactProviderRequiredActionText(item);
  }
  return output;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/** Canonical hash for binding fields (arguments, targets, payloads). */
export function hashCanonical(value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(sortKeys(value)))
    .digest("hex")}`;
}

export function mapToolRiskToProposalRisk(
  risk: "read" | "write" | "destructive" | "blocked",
): "low" | "medium" | "high" {
  if (risk === "destructive") return "high";
  if (risk === "write") return "medium";
  return "low";
}

/**
 * Extract required_actions from a raw turn.done payload (pre-normalization).
 * Prefer snake_case wire; accept camelCase product shapes.
 */
export function extractRawRequiredActions(payload: Record<string, unknown>): RawRequiredAction[] {
  const state =
    payload.state && typeof payload.state === "object" && !Array.isArray(payload.state)
      ? (payload.state as Record<string, unknown>)
      : payload;
  const raw =
    (Array.isArray(state.required_actions) ? state.required_actions : null) ??
    (Array.isArray(state.requiredActions) ? state.requiredActions : null) ??
    (Array.isArray(payload.required_actions) ? payload.required_actions : null) ??
    (Array.isArray(payload.requiredActions) ? payload.requiredActions : null) ??
    [];
  return raw.filter((item): item is RawRequiredAction => !!item && typeof item === "object");
}

function isUnexpectedChildAction(
  action: RawRequiredAction,
  persistentThreadId: string | null,
): boolean {
  const type = (readSafeString(action.type) ?? "").toLowerCase();
  if (type.includes("subagent") || type.includes("child_thread") || type.includes("native_sub")) {
    return true;
  }
  const threadId =
    readSafeString(action.thread_id) ??
    readSafeString(action.threadId) ??
    readSafeString(action.child_thread_id) ??
    readSafeString(action.childThreadId);
  if (persistentThreadId && threadId && threadId !== persistentThreadId) {
    return true;
  }
  if (!persistentThreadId && threadId) {
    // Any nested thread id without a known persistent parent is unexpected in P0.
    return true;
  }
  return false;
}

export function classifyRequiredActionType(
  action: RawRequiredAction,
): CapturedActionType | "unsupported" {
  const type = (readSafeString(action.type) ?? "").toLowerCase();
  if (
    type.includes("approval") ||
    type === "tool.approval_required" ||
    type === "approval_required"
  ) {
    return "approval";
  }
  if (
    type.includes("question") ||
    type.includes("ask_user") ||
    type === "tool.response_required" ||
    type === "input_required"
  ) {
    return "question";
  }
  if (
    type.includes("connection") ||
    type.includes("auth_required") ||
    type.includes("mcp.auth") ||
    type === "native_auth_required"
  ) {
    return "connection";
  }
  return "unsupported";
}

function providerActionIdOf(action: RawRequiredAction): string | null {
  return (
    readSafeString(action.id) ??
    readSafeString(action.provider_action_id) ??
    readSafeString(action.providerActionId) ??
    readSafeString(action.action_id) ??
    readSafeString(action.actionId)
  );
}

function toolCallIdOf(action: RawRequiredAction): string | null {
  return (
    readSafeString(action.tool_call_id) ??
    readSafeString(action.toolCallId) ??
    readSafeString(action.call_id) ??
    readSafeString(action.callId)
  );
}

function toolNameOf(action: RawRequiredAction): string | null {
  return (
    readSafeString(action.tool_name) ??
    readSafeString(action.toolName) ??
    readSafeString(action.name) ??
    readSafeString(action.tool)
  );
}

function argumentsOf(action: RawRequiredAction): unknown {
  return action.arguments ?? action.args ?? action.input ?? {};
}

function runStepStateForActions(
  actions: PauseGroupCaptureAction[],
): PauseGroupCapturePlan["runStepState"] {
  if (actions.some((a) => a.actionType === "connection")) {
    return "blocked_connection";
  }
  if (actions.some((a) => a.actionType === "approval")) {
    return "awaiting_approval";
  }
  return "awaiting_input";
}

/**
 * Build an immutable capture plan for one paused persistent-coworker turn.
 * Unexpected child-thread actions are rejected (not persisted). Parent actions are kept.
 */
export function buildPauseGroupCapturePlan(input: {
  trueforgeTurnId: string;
  generation: number;
  requiredActions: RawRequiredAction[];
  persistentThreadId?: string | null;
  approvalRedaction: ApprovalRedactionAdapter;
}): PauseGroupCapturePlan | PauseGroupCaptureFailure {
  if (input.requiredActions.length === 0) {
    return { ok: false, reason: "empty_required_actions" };
  }

  const persistentThreadId = input.persistentThreadId ?? null;
  const seen = new Set<string>();
  const actions: PauseGroupCaptureAction[] = [];
  let rejectedChildCount = 0;

  for (const raw of input.requiredActions) {
    if (isUnexpectedChildAction(raw, persistentThreadId)) {
      rejectedChildCount += 1;
      continue;
    }

    const providerActionId = providerActionIdOf(raw);
    if (!providerActionId) {
      return { ok: false, reason: "missing_provider_action_id" };
    }
    if (seen.has(providerActionId)) {
      return { ok: false, reason: "duplicate_provider_action_id", providerActionId };
    }
    seen.add(providerActionId);

    const classified = classifyRequiredActionType(raw);
    if (classified === "unsupported") {
      return {
        ok: false,
        reason: "unsupported_action",
        providerActionId,
        type: readSafeString(raw.type) ?? "unknown",
      };
    }

    if (classified === "approval") {
      const toolName = toolNameOf(raw);
      const toolCallId = toolCallIdOf(raw) ?? providerActionId;
      if (!toolName) {
        return { ok: false, reason: "approval_missing_tool", providerActionId };
      }
      let redacted: ApprovalRedactionResult;
      try {
        redacted = input.approvalRedaction.redactApproval(toolName, argumentsOf(raw));
      } catch (error) {
        return {
          ok: false,
          reason: "approval_redaction_failed",
          providerActionId,
          message: error instanceof Error ? error.message : "redaction failed",
        };
      }
      const payloadRedacted = {
        type: "approval",
        toolName,
        toolCallId,
        target: redacted.redactedTarget,
        arguments: redacted.redactedArguments,
        expectedEffect: redacted.expectedEffect,
        riskClass: redacted.riskClass,
        ...((readSafeString(raw.thread_id) ?? readSafeString(raw.threadId) ?? persistentThreadId)
          ? {
              threadId:
                readSafeString(raw.thread_id) ?? readSafeString(raw.threadId) ?? persistentThreadId,
            }
          : {}),
      };
      actions.push({
        actionType: "approval",
        providerActionId,
        toolCallId,
        toolName,
        payloadRedacted,
        payloadHash: hashCanonical(payloadRedacted),
        proposal: {
          toolCallId,
          toolName,
          observedDescriptorHash: redacted.observedDescriptorHash,
          riskClass: redacted.riskClass,
          expectedEffect: redacted.expectedEffect,
          normalizedArgumentsRedacted: redacted.redactedArguments,
          argumentsHash: redacted.argumentsHash,
          targetRedacted: redacted.redactedTarget,
          targetHash: redacted.targetHash,
          artifactRevisionHash:
            readSafeString(raw.artifact_revision_hash) ??
            readSafeString(raw.artifactRevisionHash) ??
            null,
          providerIdempotencyKey:
            readSafeString(raw.idempotency_key) ?? readSafeString(raw.idempotencyKey) ?? null,
        },
      });
      continue;
    }

    if (classified === "question") {
      const prompt = redactProviderRequiredActionText(
        raw.prompt ??
          raw.question ??
          raw.message ??
          raw.text ?? { prompt: "Additional input is required." },
      );
      const promptRedacted =
        typeof prompt === "string"
          ? { prompt }
          : prompt && typeof prompt === "object"
            ? (prompt as Record<string, unknown>)
            : { prompt: "Additional input is required." };
      const toolCallId = toolCallIdOf(raw) ?? providerActionId;
      const threadId =
        readSafeString(raw.thread_id) ?? readSafeString(raw.threadId) ?? persistentThreadId;
      const payloadRedacted = {
        type: "question",
        prompt: promptRedacted,
        toolCallId,
        ...(threadId ? { threadId } : {}),
      };
      actions.push({
        actionType: "question",
        providerActionId,
        payloadRedacted,
        payloadHash: hashCanonical(payloadRedacted),
        promptRedacted,
        promptHash: hashCanonical(promptRedacted),
      });
      continue;
    }

    const connector = redactProviderRequiredActionText(
      readSafeString(raw.connector) ??
        readSafeString(raw.provider) ??
        readSafeString(raw.toolkit) ??
        "unknown",
    );
    const reason = redactProviderRequiredActionText(
      readSafeString(raw.reason) ?? readSafeString(raw.message) ?? "connection_required",
    );
    const payloadRedacted = {
      type: "connection",
      connector,
      reason,
    };
    actions.push({
      actionType: "connection",
      providerActionId,
      payloadRedacted,
      payloadHash: hashCanonical(payloadRedacted),
    });
  }

  if (actions.length === 0) {
    return rejectedChildCount > 0
      ? { ok: false, reason: "unexpected_child_only" }
      : { ok: false, reason: "empty_required_actions" };
  }

  return {
    generation: input.generation,
    trueforgeTurnId: input.trueforgeTurnId,
    actions,
    runStepState: runStepStateForActions(actions),
    rejectedChildCount,
  };
}

/**
 * While a PauseGroup is unresolved, only that group's response intent or its
 * explicitly linked request-changes correction may proceed.
 */
export function sessionAcceptsInputWhilePaused(input: {
  hasUnresolvedPauseGroup: boolean;
  inputType: TurnQueueInputType;
  isLinkedPauseCorrection?: boolean;
}): { ok: true } | { ok: false; reason: "pause_group_unresolved" } {
  if (!input.hasUnresolvedPauseGroup) {
    return { ok: true };
  }
  if (input.inputType === "pause_group_response") {
    return { ok: true };
  }
  if (input.inputType === "correction" && input.isLinkedPauseCorrection === true) {
    return { ok: true };
  }
  return { ok: false, reason: "pause_group_unresolved" };
}

/** Convenience: build ApprovalRedactionResult from already-reviewed policy fields. */
export function buildApprovalRedactionResult(input: {
  observedDescriptorHash: string;
  riskClass: "read" | "write" | "destructive" | "blocked";
  redactedArguments: Record<string, unknown>;
  redactedTarget: Record<string, unknown>;
  expectedEffect: string;
}): ApprovalRedactionResult {
  return {
    observedDescriptorHash: input.observedDescriptorHash,
    riskClass: mapToolRiskToProposalRisk(input.riskClass),
    redactedArguments: input.redactedArguments,
    argumentsHash: hashCanonical(input.redactedArguments),
    redactedTarget: input.redactedTarget,
    targetHash: hashCanonical(input.redactedTarget),
    expectedEffect: input.expectedEffect,
  };
}
