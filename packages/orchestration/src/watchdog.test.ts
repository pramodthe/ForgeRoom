import { describe, expect, it, vi } from "vitest";
import {
  ApplicationWatchdog,
  P0_APPLICATION_WATCHDOG_LIMITS,
  readObservedTurnTokens,
  type ApplicationWatchdogClock,
  type ApplicationWatchdogViolation,
} from "./watchdog";

type TimerHandle = ReturnType<typeof setTimeout>;

class FakeClock implements ApplicationWatchdogClock {
  private nowMs = 0;
  private nextId = 1;
  private readonly timers = new Map<number, { at: number; callback: () => void }>();

  setTimeout(callback: () => void, delayMs: number): TimerHandle {
    const id = this.nextId++;
    this.timers.set(id, { at: this.nowMs + delayMs, callback });
    return id as unknown as TimerHandle;
  }

  clearTimeout(handle: TimerHandle): void {
    this.timers.delete(handle as unknown as number);
  }

  advanceBy(delayMs: number): void {
    const target = this.nowMs + delayMs;
    while (true) {
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort(([, left], [, right]) => left.at - right.at)[0];
      if (!due) {
        break;
      }
      this.nowMs = due[1].at;
      this.timers.delete(due[0]);
      due[1].callback();
    }
    this.nowMs = target;
  }
}

function startWatchdog() {
  const clock = new FakeClock();
  const violations: ApplicationWatchdogViolation[] = [];
  const watchdog = new ApplicationWatchdog({
    clock,
    onLimitExceeded: (violation) => {
      violations.push(violation);
    },
  });
  watchdog.startRun({ agentTurnId: "turn_1", runId: "run_1", runStepId: "step_1" });
  return { clock, violations, watchdog };
}

describe("P0 application watchdog", () => {
  it("freezes the accepted OD-008 budgets without claiming provider hard enforcement", () => {
    expect(P0_APPLICATION_WATCHDOG_LIMITS).toEqual({
      runMs: 180_000,
      maxObservedTurnTokens: 12_000,
      maxObservedToolCalls: 20,
      sandboxCommandMs: 60_000,
    });

    const { clock, violations } = startWatchdog();
    clock.advanceBy(180_000);
    expect(violations).toEqual([
      {
        agentTurnId: "turn_1",
        runId: "run_1",
        runStepId: "step_1",
        reason: "run_timeout",
        observed: 180_000,
        limit: 180_000,
        enforcement: "application_cancel",
        providerHardLimit: false,
      },
    ]);
    clock.advanceBy(180_000);
    expect(violations).toHaveLength(1);
  });

  it("cancels once when cumulative observed usage exceeds the token budget", () => {
    const { violations, watchdog } = startWatchdog();
    watchdog.observeTrueForgeEvent("turn_1", {
      type: "model.message",
      usage: { input_tokens: 8_000, output_tokens: 4_000 },
    });
    expect(violations).toEqual([]);

    watchdog.observeTrueForgeEvent("turn_1", {
      type: "model.message",
      usage: { total_tokens: 12_001 },
    });
    expect(violations).toMatchObject([
      {
        reason: "observed_token_limit",
        observed: 12_001,
        limit: 12_000,
        enforcement: "application_cancel",
        providerHardLimit: false,
      },
    ]);
  });

  it("counts unique observed tool calls and cancels on the twenty-first", () => {
    const { violations, watchdog } = startWatchdog();
    const toolCalls = Array.from({ length: 20 }, (_, index) => ({
      id: `tool_${index + 1}`,
      tool_info: { type: "mcp", name: "GITHUB_GET_AN_ISSUE" },
    }));
    watchdog.observeTrueForgeEvent("turn_1", { type: "model.message", tool_calls: toolCalls });
    watchdog.observeTrueForgeEvent("turn_1", { type: "model.message", tool_calls: toolCalls });
    expect(violations).toEqual([]);

    watchdog.observeTrueForgeEvent("turn_1", {
      type: "model.message",
      tool_calls: [{ id: "tool_21", tool_info: { type: "mcp", name: "GITHUB_GET_AN_ISSUE" } }],
    });
    expect(violations).toMatchObject([
      { reason: "observed_tool_call_limit", observed: 21, limit: 20 },
    ]);
  });

  it("enforces the sandbox command timer and clears it on a matching response", () => {
    const { clock, violations, watchdog } = startWatchdog();
    watchdog.observeTrueForgeEvent("turn_1", {
      type: "model.message",
      tool_calls: [{ id: "sandbox_1", function: { name: "execute_code" } }],
    });
    clock.advanceBy(59_999);
    watchdog.observeTrueForgeEvent("turn_1", {
      type: "tool.response",
      tool_call_id: "sandbox_1",
    });
    clock.advanceBy(1);
    expect(violations).toEqual([]);

    watchdog.observeTrueForgeEvent("turn_1", {
      type: "model.message",
      tool_calls: [{ id: "sandbox_2", function: { name: "execute_code" } }],
    });
    clock.advanceBy(60_000);
    expect(violations).toMatchObject([
      {
        reason: "sandbox_command_timeout",
        observed: 60_000,
        limit: 60_000,
        sandboxToolCallId: "sandbox_2",
      },
    ]);
  });

  it("clears every timer when a turn terminates or the worker stops", () => {
    const clock = new FakeClock();
    const onLimitExceeded = vi.fn();
    const watchdog = new ApplicationWatchdog({ clock, onLimitExceeded });
    watchdog.startRun({ agentTurnId: "turn_done", runId: "run_done", runStepId: "step_done" });
    watchdog.observeTrueForgeEvent("turn_done", { type: "turn.done" });
    watchdog.startRun({ agentTurnId: "turn_stop", runId: "run_stop", runStepId: "step_stop" });
    watchdog.stop();
    clock.advanceBy(360_000);
    expect(onLimitExceeded).not.toHaveBeenCalled();
  });
});

describe("token usage observation", () => {
  it("accepts cumulative total and complete input/output usage only", () => {
    expect(readObservedTurnTokens({ usage: { totalTokens: 42 } })).toBe(42);
    expect(
      readObservedTurnTokens({ token_usage: { prompt_tokens: 30, completion_tokens: 12 } }),
    ).toBe(42);
    expect(readObservedTurnTokens({ usage: { input_tokens: 30 } })).toBeNull();
    expect(readObservedTurnTokens({ usage: { total_tokens: 1.5 } })).toBeNull();
    expect(readObservedTurnTokens({})).toBeNull();
  });
});
