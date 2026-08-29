import { describe, expect, it } from "vitest";
import type {
  ActionProposalState,
  AgentTurnState,
  CoworkerDraftState,
  PauseGroupState,
  RunLifecycle,
  RunStepState,
  TaskStatus,
} from "@forgeroom/contracts";
import {
  ACTION_PROPOSAL_TRANSITIONS,
  AGENT_TURN_RECONCILIATION_TRANSITIONS,
  canReconcileAgentTurn,
  AGENT_TURN_TRANSITIONS,
  canTransitionActionProposal,
  canTransitionAgentTurn,
  canTransitionCoworkerDraft,
  canTransitionPauseGroup,
  canTransitionRunLifecycle,
  canTransitionRunStep,
  canTransitionTask,
  canTransitionUiComponentInterrupt,
  canTransitionUiInteraction,
  COWORKER_DRAFT_TRANSITIONS,
  PAUSE_GROUP_TRANSITIONS,
  RUN_LIFECYCLE_TRANSITIONS,
  RUN_STEP_TRANSITIONS,
  TASK_TRANSITIONS,
  UI_COMPONENT_INTERRUPT_TRANSITIONS,
  UI_INTERACTION_TRANSITIONS,
  type UiComponentInterruptState,
  type UiInteractionState,
} from "./transitions";

function assertClosedGraph<T extends string>(
  table: Record<T, readonly T[]>,
  canTransition: (from: T, to: T) => boolean,
  illegalSamples: Array<readonly [T, T]>,
): void {
  const states = Object.keys(table) as T[];
  for (const from of states) {
    for (const to of table[from]) {
      expect(canTransition(from, to), `${from} → ${to}`).toBe(true);
    }
    for (const to of states) {
      if (!table[from].includes(to)) {
        expect(canTransition(from, to), `illegal ${from} → ${to}`).toBe(false);
      }
    }
  }
  for (const [from, to] of illegalSamples) {
    expect(canTransition(from, to)).toBe(false);
  }
}

describe("domain transition guards (P0-501)", () => {
  it("enumerates TaskStatus edges and rejects closed→open", () => {
    assertClosedGraph<TaskStatus>(TASK_TRANSITIONS, canTransitionTask, [
      ["done", "todo"],
      ["cancelled", "in_progress"],
      ["todo", "done"],
    ]);
  });

  it("enumerates RunLifecycle edges", () => {
    assertClosedGraph<RunLifecycle>(RUN_LIFECYCLE_TRANSITIONS, canTransitionRunLifecycle, [
      ["completed", "active"],
      ["queued", "completed"],
    ]);
  });

  it("enumerates CoworkerDraft edges", () => {
    assertClosedGraph<CoworkerDraftState>(COWORKER_DRAFT_TRANSITIONS, canTransitionCoworkerDraft, [
      ["ready", "draft"],
      ["confirmed", "awaiting_review"],
    ]);
  });

  it("enumerates RunStep edges including awaiting_* and blocked_connection", () => {
    assertClosedGraph<RunStepState>(RUN_STEP_TRANSITIONS, canTransitionRunStep, [
      ["completed", "running"],
      ["queued", "running"],
      ["awaiting_approval", "completed"],
      ["blocked_connection", "running"],
    ]);
    expect(canTransitionRunStep("running", "awaiting_approval")).toBe(true);
    expect(canTransitionRunStep("awaiting_approval", "running")).toBe(true);
    expect(canTransitionRunStep("blocked_connection", "queued")).toBe(true);
  });

  it("enumerates AgentTurn edges; required_actions is terminal", () => {
    assertClosedGraph<AgentTurnState>(AGENT_TURN_TRANSITIONS, canTransitionAgentTurn, [
      ["required_actions", "streaming"],
      ["completed", "resuming"],
      ["streaming", "acquiring"],
    ]);
    expect(canTransitionAgentTurn("intended", "resuming")).toBe(true);
    expect(canTransitionAgentTurn("resuming", "streaming")).toBe(true);
    expect(canTransitionAgentTurn("streaming", "required_actions")).toBe(true);
    expect(AGENT_TURN_TRANSITIONS.required_actions).toEqual([]);
    expect(AGENT_TURN_TRANSITIONS.uncertain).toEqual([]);
  });

  it("allows uncertain recovery only through the history-reconciliation guard", () => {
    expect(AGENT_TURN_RECONCILIATION_TRANSITIONS).toEqual({ uncertain: ["streaming"] });
    expect(canReconcileAgentTurn("uncertain", "streaming")).toBe(true);
    expect(canTransitionAgentTurn("uncertain", "streaming")).toBe(false);
    expect(canReconcileAgentTurn("uncertain", "creating")).toBe(false);
    expect(canReconcileAgentTurn("creating", "streaming")).toBe(false);
  });

  it("enumerates PauseGroup edges including CAS ready → resuming", () => {
    assertClosedGraph<PauseGroupState>(PAUSE_GROUP_TRANSITIONS, canTransitionPauseGroup, [
      ["collecting", "resuming"],
      ["resumed", "collecting"],
      ["resuming", "ready"],
    ]);
    expect(canTransitionPauseGroup("collecting", "ready")).toBe(true);
    expect(canTransitionPauseGroup("ready", "resuming")).toBe(true);
    expect(canTransitionPauseGroup("resuming", "resumed")).toBe(true);
  });

  it("enumerates ActionProposal edges including reconcile from unknown", () => {
    assertClosedGraph<ActionProposalState>(
      ACTION_PROPOSAL_TRANSITIONS,
      canTransitionActionProposal,
      [
        ["denied", "executing"],
        ["proposed", "executing"],
        ["succeeded", "unknown"],
        ["allowed", "succeeded"],
      ],
    );
    expect(canTransitionActionProposal("proposed", "allowed")).toBe(true);
    expect(canTransitionActionProposal("allowed", "executing")).toBe(true);
    expect(canTransitionActionProposal("unknown", "reconciled_succeeded")).toBe(true);
  });

  it("closes controlled UI interrupt terminal states", () => {
    assertClosedGraph<UiComponentInterruptState>(
      UI_COMPONENT_INTERRUPT_TRANSITIONS,
      canTransitionUiComponentInterrupt,
      [
        ["resolved", "stale"],
        ["continued", "waiting"],
        ["stale", "resolved"],
      ],
    );
    expect(canTransitionUiComponentInterrupt("waiting", "resolved")).toBe(true);
    expect(canTransitionUiComponentInterrupt("waiting", "stale")).toBe(true);
    expect(canTransitionUiComponentInterrupt("resolved", "continued")).toBe(true);
  });

  it("allows stale only from nonterminal controlled UI interactions", () => {
    assertClosedGraph<UiInteractionState>(UI_INTERACTION_TRANSITIONS, canTransitionUiInteraction, [
      ["succeeded", "stale"],
      ["failed", "token_issued"],
      ["stale", "prepared"],
    ]);
    expect(canTransitionUiInteraction("prepared", "stale")).toBe(true);
    expect(canTransitionUiInteraction("token_issued", "stale")).toBe(true);
    expect(canTransitionUiInteraction("dispatching", "stale")).toBe(true);
  });
});
