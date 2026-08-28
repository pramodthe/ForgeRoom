import type { TrueForgeClient, TrueForgeTurn, TrueForgeTurnEvent } from "@forgeroom/trueforge";

/**
 * Application tool activity events projected for the channel timeline.
 * Only policy-approved safe fields — never raw tool bodies or credentials.
 */
export type ProjectedToolActivityEvent = {
  normalizedType: "tool.started" | "tool.succeeded" | "tool.failed" | "connection.blocked";
  payloadRedacted: Record<string, unknown>;
};

export type TrueForgeDirectToolObservation = {
  /** Tool name TrueForge/MCP actually invoked. */
  observedToolName: string;
  toolCallId: string;
  arguments: Record<string, unknown>;
  /** Raw provider/MCP result — process memory only. */
  rawResult: unknown;
  trueforgeTurnId: string;
  trueforgeEventIds: string[];
};

export type RealReadPreflightAdapterResult =
  | {
      ok: true;
      blocksDispatch: false;
      toolSlug: string;
      accountSuffix: string;
      connectorName: string;
      descriptorHash: string;
    }
  | {
      ok: false;
      blocksDispatch: true;
      reason: string;
      runStepState: "blocked_connection" | null;
      accountSuffix: string;
      toolSlug: string;
    };

export type RealReadSafeSummary = {
  coworkerId: string;
  toolName: string;
  connectorName: string;
  accountSuffix: string;
  riskClass: "read";
  target: Record<string, unknown>;
  redactedArguments: Record<string, unknown>;
  resultSummary: string;
  receipt: Record<string, unknown> | null;
  rawResultObserved: boolean;
  rawResultByteLength: number | null;
};

export type RealReadDispatchAdapters = {
  preflight: () => RealReadPreflightAdapterResult | Promise<RealReadPreflightAdapterResult>;
  /**
   * Ask TrueForge to run the coworker turn that invokes the Composio MCP direct tool.
   * Implementations must observe the literal tool slug (reject meta wrappers).
   */
  invokeViaTrueForge: () =>
    TrueForgeDirectToolObservation | Promise<TrueForgeDirectToolObservation>;
  assertDirectTool: (observedToolName: string) => void;
  buildSafeSummary: (input: {
    coworkerId: string;
    accountSuffix: string;
    arguments: unknown;
    rawResult: unknown;
  }) => RealReadSafeSummary;
  isAuthFailure?: (raw: unknown) => boolean;
};

export type RealReadDispatchInput = {
  coworkerId: string;
  channelId: string;
  runId: string;
  agentTurnId: string;
};

export type RealReadDispatchResult =
  | {
      ok: true;
      kind: "succeeded";
      events: ProjectedToolActivityEvent[];
      summary: RealReadSafeSummary;
      trueforgeTurnId: string;
      observedToolName: string;
    }
  | {
      ok: false;
      kind: "blocked_connection" | "preflight_blocked" | "tool_failed" | "meta_tool_rejected";
      events: ProjectedToolActivityEvent[];
      reason: string;
      runStepState: "blocked_connection" | null;
    };

/**
 * Project a safe attributed tool.started / tool.succeeded (or failed) pair.
 * Payload contains coworker, tool, redacted request and result summary only.
 */
export function projectSafeReadToolEvents(input: {
  summary: RealReadSafeSummary;
  outcome: "succeeded" | "failed";
  toolCallId: string;
  channelId: string;
  runId: string;
  agentTurnId: string;
}): ProjectedToolActivityEvent[] {
  const request = {
    coworker_id: input.summary.coworkerId,
    tool_name: input.summary.toolName,
    connector_name: input.summary.connectorName,
    account_suffix: input.summary.accountSuffix,
    risk_class: input.summary.riskClass,
    target: input.summary.target,
    redacted_arguments: input.summary.redactedArguments,
    channel_id: input.channelId,
    run_id: input.runId,
    agent_turn_id: input.agentTurnId,
    tool_call_id: input.toolCallId,
  };

  const started: ProjectedToolActivityEvent = {
    normalizedType: "tool.started",
    payloadRedacted: {
      type: "tool.started",
      ...request,
    },
  };

  const terminalType = input.outcome === "succeeded" ? "tool.succeeded" : "tool.failed";
  const terminal: ProjectedToolActivityEvent = {
    normalizedType: terminalType,
    payloadRedacted: {
      type: terminalType,
      ...request,
      result_summary: input.summary.resultSummary,
      receipt: input.summary.receipt,
      raw_result_observed: input.summary.rawResultObserved,
      raw_result_byte_length: input.summary.rawResultByteLength,
    },
  };

  assertNoRawOrCredentials(started.payloadRedacted);
  assertNoRawOrCredentials(terminal.payloadRedacted);
  return [started, terminal];
}

export function projectBlockedConnectionEvent(input: {
  coworkerId: string;
  accountSuffix: string;
  toolSlug: string;
  reason: string;
  channelId: string;
  runId: string;
  agentTurnId: string;
}): ProjectedToolActivityEvent {
  const event: ProjectedToolActivityEvent = {
    normalizedType: "connection.blocked",
    payloadRedacted: {
      type: "connection.blocked",
      coworker_id: input.coworkerId,
      tool_name: input.toolSlug,
      account_suffix: input.accountSuffix,
      reason: input.reason,
      run_step_state: "blocked_connection",
      channel_id: input.channelId,
      run_id: input.runId,
      agent_turn_id: input.agentTurnId,
      fallback_account_selected: false,
    },
  };
  assertNoRawOrCredentials(event.payloadRedacted);
  return event;
}

/**
 * Persistent-coworker real Composio read: preflight → TrueForge direct tool → safe events.
 */
export async function dispatchPersistentCoworkerRealRead(
  adapters: RealReadDispatchAdapters,
  input: RealReadDispatchInput,
): Promise<RealReadDispatchResult> {
  const preflight = await adapters.preflight();
  if (!preflight.ok) {
    const events: ProjectedToolActivityEvent[] = [];
    if (preflight.runStepState === "blocked_connection") {
      events.push(
        projectBlockedConnectionEvent({
          coworkerId: input.coworkerId,
          accountSuffix: preflight.accountSuffix,
          toolSlug: preflight.toolSlug,
          reason: preflight.reason,
          channelId: input.channelId,
          runId: input.runId,
          agentTurnId: input.agentTurnId,
        }),
      );
    }
    return {
      ok: false,
      kind:
        preflight.runStepState === "blocked_connection"
          ? "blocked_connection"
          : "preflight_blocked",
      events,
      reason: preflight.reason,
      runStepState: preflight.runStepState,
    };
  }

  let observation: TrueForgeDirectToolObservation;
  try {
    observation = await adapters.invokeViaTrueForge();
    adapters.assertDirectTool(observation.observedToolName);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const meta = /meta-tool|forbidden|COMPOSIO_/i.test(message);
    return {
      ok: false,
      kind: meta ? "meta_tool_rejected" : "tool_failed",
      events: [],
      reason: message,
      runStepState: null,
    };
  }

  if (adapters.isAuthFailure?.(observation.rawResult)) {
    const blocked = projectBlockedConnectionEvent({
      coworkerId: input.coworkerId,
      accountSuffix: preflight.accountSuffix,
      toolSlug: preflight.toolSlug,
      reason: "expired_account",
      channelId: input.channelId,
      runId: input.runId,
      agentTurnId: input.agentTurnId,
    });
    return {
      ok: false,
      kind: "blocked_connection",
      events: [blocked],
      reason: "expired_account",
      runStepState: "blocked_connection",
    };
  }

  const summary = adapters.buildSafeSummary({
    coworkerId: input.coworkerId,
    accountSuffix: preflight.accountSuffix,
    arguments: observation.arguments,
    rawResult: observation.rawResult,
  });

  // Drop any accidental raw fields before event projection.
  assertNoRawOrCredentials(summary.redactedArguments);
  assertNoRawOrCredentials(summary.target);

  const successful =
    observation.rawResult &&
    typeof observation.rawResult === "object" &&
    !Array.isArray(observation.rawResult) &&
    (observation.rawResult as { successful?: unknown }).successful === false
      ? false
      : true;

  const events = projectSafeReadToolEvents({
    summary,
    outcome: successful ? "succeeded" : "failed",
    toolCallId: observation.toolCallId,
    channelId: input.channelId,
    runId: input.runId,
    agentTurnId: input.agentTurnId,
  });

  if (!successful) {
    return {
      ok: false,
      kind: "tool_failed",
      events,
      reason: summary.resultSummary,
      runStepState: null,
    };
  }

  return {
    ok: true,
    kind: "succeeded",
    events,
    summary,
    trueforgeTurnId: observation.trueforgeTurnId,
    observedToolName: observation.observedToolName,
  };
}

/**
 * Extract a direct-tool observation from TrueForge turn events.
 * Prefers explicit tool.call / tool.result frames; fails closed on meta tools.
 */
export function extractDirectToolObservationFromTrueForgeEvents(input: {
  turn: Pick<TrueForgeTurn, "id">;
  events: readonly TrueForgeTurnEvent[];
  expectedToolName: string;
}): TrueForgeDirectToolObservation | null {
  let toolCallId: string | null = null;
  let argumentsPayload: Record<string, unknown> | null = null;
  let rawResult: unknown = null;
  let observedToolName: string | null = null;
  const eventIds: string[] = [];

  for (const event of input.events) {
    const type = String(event.type ?? "");
    const id = typeof event.id === "string" ? event.id : "";
    if (id) {
      eventIds.push(id);
    }
    const name =
      readToolName(event) ??
      (event.tool && typeof event.tool === "object"
        ? readToolName(event.tool as Record<string, unknown>)
        : null);

    if (
      type === "tool.call" ||
      type === "tool.called" ||
      type === "mcp.tool.call" ||
      type === "tool.started"
    ) {
      if (name) {
        observedToolName = name;
      }
      toolCallId =
        readString(event.tool_call_id) ??
        readString(event.toolCallId) ??
        readString(event.id) ??
        toolCallId;
      const args = event.arguments ?? event.args ?? event.input;
      if (args && typeof args === "object" && !Array.isArray(args)) {
        argumentsPayload = args as Record<string, unknown>;
      }
    }

    if (
      type === "tool.result" ||
      type === "tool.response" ||
      type === "tool.completed" ||
      type === "mcp.tool.result" ||
      type === "tool.succeeded"
    ) {
      if (name) {
        observedToolName = name;
      }
      toolCallId = readString(event.tool_call_id) ?? readString(event.toolCallId) ?? toolCallId;
      rawResult = event.result ?? event.output ?? event.content ?? event.data ?? rawResult;
      if (!argumentsPayload) {
        const args = event.arguments ?? event.args;
        if (args && typeof args === "object" && !Array.isArray(args)) {
          argumentsPayload = args as Record<string, unknown>;
        }
      }
    }
  }

  if (!observedToolName || observedToolName !== input.expectedToolName) {
    return null;
  }
  if (!toolCallId || !argumentsPayload) {
    return null;
  }

  return {
    observedToolName,
    toolCallId,
    arguments: argumentsPayload,
    rawResult,
    trueforgeTurnId: input.turn.id,
    trueforgeEventIds: eventIds,
  };
}

/**
 * Helper used by workers/probes: create a TrueForge turn then list events until the
 * direct read tool is observed (or timeout). Callers inject poll timing.
 */
export async function invokeDirectReadViaTrueForgeTurn(input: {
  client: Pick<TrueForgeClient, "createTurn" | "listTurnEvents">;
  sessionId: string;
  previousTurnId: "none" | string;
  instruction: string;
  expectedToolName: string;
  pollEvents?: (sessionId: string, turnId: string) => Promise<TrueForgeTurnEvent[]>;
}): Promise<TrueForgeDirectToolObservation> {
  const turn = await input.client.createTurn(input.sessionId, {
    input: [{ type: "user.message", content: input.instruction }],
    previousTurnId: input.previousTurnId,
    stream: false,
  });
  const events =
    (await input.pollEvents?.(input.sessionId, turn.id)) ??
    (await input.client.listTurnEvents(input.sessionId, turn.id));
  const observation = extractDirectToolObservationFromTrueForgeEvents({
    turn,
    events,
    expectedToolName: input.expectedToolName,
  });
  if (!observation) {
    const names = events
      .map((event) => readToolName(event))
      .filter((name): name is string => Boolean(name));
    throw new Error(
      `TrueForge turn ${turn.id} did not invoke direct tool ${input.expectedToolName}` +
        (names.length > 0 ? `; observed tools: ${names.join(", ")}` : ""),
    );
  }
  return observation;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readToolName(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  return (
    readString(row.tool_name) ??
    readString(row.toolName) ??
    readString(row.name) ??
    readString(row.slug) ??
    null
  );
}

const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "raw_tool_body",
  "raw_result",
  "rawresult",
  "access_token",
  "accesstoken",
  "refresh_token",
  "refreshtoken",
  "api_key",
  "apikey",
  "authorization",
  "authheader",
  "x-api-key",
  "xapikey",
  "composio_api_key",
  "composioapikey",
  "password",
  "client_secret",
  "clientsecret",
  "credential",
  "credentials",
]);

function normalizePayloadKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Security invariant for projected events and summaries. */
export function assertNoRawOrCredentials(value: unknown): void {
  walkForbiddenKeys(value);
}

function walkForbiddenKeys(value: unknown): void {
  if (value === null || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      walkForbiddenKeys(item);
    }
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = normalizePayloadKey(key);
    if (FORBIDDEN_PAYLOAD_KEYS.has(normalized) || FORBIDDEN_PAYLOAD_KEYS.has(key.toLowerCase())) {
      throw new Error(`forbidden payload marker present: ${key}`);
    }
    walkForbiddenKeys(child);
  }
}
