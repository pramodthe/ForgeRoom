import { extractToolCallsFromModelMessage } from "@forgeroom/trueforge";

export const P0_RUN_WATCHDOG_MS = 180_000;
export const P0_MAX_OBSERVED_TURN_TOKENS = 12_000;
export const P0_MAX_OBSERVED_TOOL_CALLS = 20;
export const P0_SANDBOX_COMMAND_WATCHDOG_MS = 60_000;

export type ApplicationWatchdogLimits = {
  runMs: number;
  maxObservedTurnTokens: number;
  maxObservedToolCalls: number;
  sandboxCommandMs: number;
};

/**
 * P0 application-owned watchdog budgets accepted for OD-008. Token and tool-call
 * observations remain best effort because TrueForge does not expose a hard
 * provider-side budget contract.
 */
export const P0_APPLICATION_WATCHDOG_LIMITS: Readonly<ApplicationWatchdogLimits> = {
  runMs: P0_RUN_WATCHDOG_MS,
  maxObservedTurnTokens: P0_MAX_OBSERVED_TURN_TOKENS,
  maxObservedToolCalls: P0_MAX_OBSERVED_TOOL_CALLS,
  sandboxCommandMs: P0_SANDBOX_COMMAND_WATCHDOG_MS,
};

export type ApplicationWatchdogReason =
  "run_timeout" | "observed_token_limit" | "observed_tool_call_limit" | "sandbox_command_timeout";

export type ApplicationWatchdogViolation = {
  agentTurnId: string;
  runId: string;
  runStepId: string;
  reason: ApplicationWatchdogReason;
  observed: number;
  limit: number;
  /** Application cancellation is enforced once; this is not a provider hard limit. */
  enforcement: "application_cancel";
  providerHardLimit: false;
  sandboxToolCallId?: string;
};

type TimeoutHandle = ReturnType<typeof setTimeout>;

export type ApplicationWatchdogClock = {
  setTimeout: (callback: () => void, delayMs: number) => TimeoutHandle;
  clearTimeout: (handle: TimeoutHandle) => void;
};

type ActiveRunWatchdog = {
  runId: string;
  runStepId: string;
  runTimer: TimeoutHandle | null;
  observedTurnTokens: number;
  seenToolCallIds: Set<string>;
  sandboxTimers: Map<string, TimeoutHandle>;
  exceeded: boolean;
};

export type ApplicationWatchdogOptions = {
  limits?: ApplicationWatchdogLimits;
  onLimitExceeded: (violation: ApplicationWatchdogViolation) => void | Promise<void>;
  onCallbackError?: (error: unknown, violation: ApplicationWatchdogViolation) => void;
  clock?: ApplicationWatchdogClock;
};

function defaultClock(): ApplicationWatchdogClock {
  return {
    setTimeout(callback, delayMs) {
      const handle = setTimeout(callback, delayMs);
      handle.unref?.();
      return handle;
    },
    clearTimeout(handle) {
      clearTimeout(handle);
    },
  };
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Read a cumulative turn-token observation only when the event supplies one. */
export function readObservedTurnTokens(raw: Record<string, unknown>): number | null {
  const usage = asRecord(raw.usage) ?? asRecord(raw.token_usage) ?? asRecord(raw.tokenUsage);
  if (!usage) {
    return null;
  }
  const total = nonNegativeInteger(usage.total_tokens) ?? nonNegativeInteger(usage.totalTokens);
  if (total !== null) {
    return total;
  }
  const input =
    nonNegativeInteger(usage.input_tokens) ??
    nonNegativeInteger(usage.inputTokens) ??
    nonNegativeInteger(usage.prompt_tokens) ??
    nonNegativeInteger(usage.promptTokens);
  const output =
    nonNegativeInteger(usage.output_tokens) ??
    nonNegativeInteger(usage.outputTokens) ??
    nonNegativeInteger(usage.completion_tokens) ??
    nonNegativeInteger(usage.completionTokens);
  return input !== null && output !== null ? input + output : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toolResponseId(raw: Record<string, unknown>): string | null {
  return readString(raw.tool_call_id) ?? readString(raw.toolCallId);
}

/**
 * Process-local watchdog registry. Durable restart handling remains fail-closed:
 * startup marks uncertain active turns needs-attention instead of silently
 * recreating timers or remote work.
 */
export class ApplicationWatchdog {
  private readonly limits: ApplicationWatchdogLimits;
  private readonly clock: ApplicationWatchdogClock;
  private readonly onLimitExceeded: ApplicationWatchdogOptions["onLimitExceeded"];
  private readonly onCallbackError: NonNullable<ApplicationWatchdogOptions["onCallbackError"]>;
  private readonly runs = new Map<string, ActiveRunWatchdog>();

  constructor(options: ApplicationWatchdogOptions) {
    this.limits = options.limits ?? P0_APPLICATION_WATCHDOG_LIMITS;
    this.clock = options.clock ?? defaultClock();
    this.onLimitExceeded = options.onLimitExceeded;
    this.onCallbackError = options.onCallbackError ?? (() => undefined);
  }

  startRun(input: { agentTurnId: string; runId: string; runStepId: string }): void {
    if (this.runs.has(input.agentTurnId)) {
      return;
    }
    const run: ActiveRunWatchdog = {
      runId: input.runId,
      runStepId: input.runStepId,
      runTimer: null,
      observedTurnTokens: 0,
      seenToolCallIds: new Set(),
      sandboxTimers: new Map(),
      exceeded: false,
    };
    this.runs.set(input.agentTurnId, run);
    run.runTimer = this.clock.setTimeout(() => {
      this.exceed(input.agentTurnId, {
        reason: "run_timeout",
        observed: this.limits.runMs,
        limit: this.limits.runMs,
      });
    }, this.limits.runMs);
  }

  observeTrueForgeEvent(agentTurnId: string, raw: Record<string, unknown>): void {
    const run = this.runs.get(agentTurnId);
    if (!run || run.exceeded) {
      return;
    }

    const observedTokens = readObservedTurnTokens(raw);
    if (observedTokens !== null) {
      run.observedTurnTokens = Math.max(run.observedTurnTokens, observedTokens);
      if (run.observedTurnTokens > this.limits.maxObservedTurnTokens) {
        this.exceed(agentTurnId, {
          reason: "observed_token_limit",
          observed: run.observedTurnTokens,
          limit: this.limits.maxObservedTurnTokens,
        });
        return;
      }
    }

    const type = readString(raw.type) ?? "unknown";
    if (type === "model.message") {
      for (const toolCall of extractToolCallsFromModelMessage(raw)) {
        if (run.seenToolCallIds.has(toolCall.id)) {
          continue;
        }
        run.seenToolCallIds.add(toolCall.id);
        if (run.seenToolCallIds.size > this.limits.maxObservedToolCalls) {
          this.exceed(agentTurnId, {
            reason: "observed_tool_call_limit",
            observed: run.seenToolCallIds.size,
            limit: this.limits.maxObservedToolCalls,
          });
          return;
        }
        if (toolCall.isSandboxCommand) {
          this.startSandboxCommand(agentTurnId, toolCall.id);
        }
      }
    }

    if (type === "tool.response") {
      const toolCallId = toolResponseId(raw);
      if (toolCallId) {
        this.finishSandboxCommand(agentTurnId, toolCallId);
      }
    }

    if (
      type === "turn.done" ||
      type === "turn.error" ||
      type === "turn.failed" ||
      type === "session.error"
    ) {
      this.finishRun(agentTurnId);
    }
  }

  finishRun(agentTurnId: string): void {
    const run = this.runs.get(agentTurnId);
    if (!run) {
      return;
    }
    if (run.runTimer) {
      this.clock.clearTimeout(run.runTimer);
    }
    for (const timer of run.sandboxTimers.values()) {
      this.clock.clearTimeout(timer);
    }
    this.runs.delete(agentTurnId);
  }

  stop(): void {
    for (const agentTurnId of [...this.runs.keys()]) {
      this.finishRun(agentTurnId);
    }
  }

  private startSandboxCommand(agentTurnId: string, toolCallId: string): void {
    const run = this.runs.get(agentTurnId);
    if (!run || run.exceeded || run.sandboxTimers.has(toolCallId)) {
      return;
    }
    const timer = this.clock.setTimeout(() => {
      this.exceed(agentTurnId, {
        reason: "sandbox_command_timeout",
        observed: this.limits.sandboxCommandMs,
        limit: this.limits.sandboxCommandMs,
        sandboxToolCallId: toolCallId,
      });
    }, this.limits.sandboxCommandMs);
    run.sandboxTimers.set(toolCallId, timer);
  }

  private finishSandboxCommand(agentTurnId: string, toolCallId: string): void {
    const run = this.runs.get(agentTurnId);
    const timer = run?.sandboxTimers.get(toolCallId);
    if (!run || !timer) {
      return;
    }
    this.clock.clearTimeout(timer);
    run.sandboxTimers.delete(toolCallId);
  }

  private exceed(
    agentTurnId: string,
    input: Pick<ApplicationWatchdogViolation, "reason" | "observed" | "limit"> & {
      sandboxToolCallId?: string;
    },
  ): void {
    const run = this.runs.get(agentTurnId);
    if (!run || run.exceeded) {
      return;
    }
    run.exceeded = true;
    const violation: ApplicationWatchdogViolation = {
      agentTurnId,
      runId: run.runId,
      runStepId: run.runStepId,
      reason: input.reason,
      observed: input.observed,
      limit: input.limit,
      enforcement: "application_cancel",
      providerHardLimit: false,
      ...(input.sandboxToolCallId ? { sandboxToolCallId: input.sandboxToolCallId } : {}),
    };
    this.finishRun(agentTurnId);
    Promise.resolve(this.onLimitExceeded(violation)).catch((error: unknown) => {
      this.onCallbackError(error, violation);
    });
  }
}
