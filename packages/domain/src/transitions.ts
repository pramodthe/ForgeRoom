import type {
  ActionProposalState,
  AgentTurnState,
  CoworkerDraftState,
  PauseGroupState,
  RunLifecycle,
  RunStepState,
  TaskStatus,
} from "@forgeroom/contracts";

export type UiComponentInterruptState = "waiting" | "resolved" | "continued" | "stale";
export type UiInteractionState =
  "prepared" | "token_issued" | "dispatching" | "succeeded" | "failed" | "denied" | "stale";

export const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  todo: ["in_progress", "blocked", "cancelled"],
  in_progress: ["blocked", "in_review", "done", "cancelled"],
  blocked: ["in_progress", "cancelled"],
  in_review: ["in_progress", "done", "cancelled"],
  done: [],
  cancelled: [],
};

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from]?.includes(to) ?? false;
}

export const RUN_LIFECYCLE_TRANSITIONS: Record<RunLifecycle, readonly RunLifecycle[]> = {
  queued: ["active"],
  active: ["completed", "partial", "failed", "cancelled"],
  completed: [],
  partial: [],
  failed: [],
  cancelled: [],
};

export function canTransitionRunLifecycle(from: RunLifecycle, to: RunLifecycle): boolean {
  return RUN_LIFECYCLE_TRANSITIONS[from]?.includes(to) ?? false;
}

export const COWORKER_DRAFT_TRANSITIONS: Record<CoworkerDraftState, readonly CoworkerDraftState[]> =
  {
    draft: ["awaiting_review", "superseded", "expired", "rejected"],
    awaiting_review: ["confirmed", "superseded", "expired", "rejected"],
    confirmed: ["provisioning"],
    provisioning: ["ready", "failed_provisioning"],
    failed_provisioning: ["provisioning"],
    ready: [],
    superseded: [],
    expired: [],
    rejected: [],
  };

export function canTransitionCoworkerDraft(
  from: CoworkerDraftState,
  to: CoworkerDraftState,
): boolean {
  return COWORKER_DRAFT_TRANSITIONS[from]?.includes(to) ?? false;
}

export const RUN_STEP_TRANSITIONS: Record<RunStepState, readonly RunStepState[]> = {
  queued: ["acquiring_session"],
  acquiring_session: ["running"],
  running: [
    "awaiting_input",
    "awaiting_approval",
    "blocked_connection",
    "cancelling",
    "completed",
    "failed",
    "cancelled",
    "unknown",
  ],
  awaiting_input: ["running", "cancelling", "failed", "cancelled"],
  awaiting_approval: ["running", "cancelling", "failed", "cancelled"],
  blocked_connection: ["queued", "cancelling", "failed", "cancelled"],
  cancelling: ["cancelled", "completed", "failed", "unknown"],
  cancelled: [],
  completed: [],
  failed: [],
  unknown: [],
};

export function canTransitionRunStep(from: RunStepState, to: RunStepState): boolean {
  return RUN_STEP_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * AgentTurn legal edges from `data-model.md`.
 * `required_actions` is terminal for that turn (RunStep stays nonterminal).
 * Response-only resume turns use `intended → resuming → streaming`.
 */
export const AGENT_TURN_TRANSITIONS: Record<AgentTurnState, readonly AgentTurnState[]> = {
  intended: ["acquiring", "resuming"],
  acquiring: ["creating", "failed", "cancelled", "uncertain"],
  creating: ["streaming", "failed", "cancelled", "uncertain"],
  streaming: ["required_actions", "completed", "failed", "cancelled", "uncertain"],
  required_actions: [],
  resuming: ["streaming", "failed", "cancelled", "uncertain"],
  completed: [],
  failed: [],
  cancelled: [],
  uncertain: [],
};

export function canTransitionAgentTurn(from: AgentTurnState, to: AgentTurnState): boolean {
  return AGENT_TURN_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Recovery-only AgentTurn edges. These are deliberately excluded from
 * `AGENT_TURN_TRANSITIONS`: callers must have matched a remote turn from
 * provider history before using this guard.
 */
export const AGENT_TURN_RECONCILIATION_TRANSITIONS: Partial<
  Record<AgentTurnState, readonly AgentTurnState[]>
> = {
  uncertain: ["streaming"],
};

export function canReconcileAgentTurn(from: AgentTurnState, to: AgentTurnState): boolean {
  return AGENT_TURN_RECONCILIATION_TRANSITIONS[from]?.includes(to) ?? false;
}

/** PauseGroup legal edges from `data-model.md` (CAS collecting/ready → resuming). */
export const PAUSE_GROUP_TRANSITIONS: Record<PauseGroupState, readonly PauseGroupState[]> = {
  collecting: ["ready", "stale", "expired", "cancelled"],
  ready: ["resuming", "stale", "expired", "cancelled"],
  resuming: ["resumed", "uncertain"],
  resumed: [],
  stale: [],
  expired: [],
  cancelled: [],
  uncertain: [],
};

export function canTransitionPauseGroup(from: PauseGroupState, to: PauseGroupState): boolean {
  return PAUSE_GROUP_TRANSITIONS[from]?.includes(to) ?? false;
}

/** ActionProposal legal edges from `data-model.md`. */
export const ACTION_PROPOSAL_TRANSITIONS: Record<
  ActionProposalState,
  readonly ActionProposalState[]
> = {
  proposed: ["allowed", "denied", "expired", "stale"],
  allowed: ["executing"],
  denied: [],
  expired: [],
  stale: [],
  executing: ["succeeded", "failed", "unknown"],
  succeeded: [],
  failed: [],
  unknown: ["reconciled_succeeded", "reconciled_failed"],
  reconciled_succeeded: [],
  reconciled_failed: [],
};

export function canTransitionActionProposal(
  from: ActionProposalState,
  to: ActionProposalState,
): boolean {
  return ACTION_PROPOSAL_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Controlled-component interrupt edges enforced by the persistence gateway. */
export const UI_COMPONENT_INTERRUPT_TRANSITIONS: Record<
  UiComponentInterruptState,
  readonly UiComponentInterruptState[]
> = {
  waiting: ["resolved", "stale"],
  resolved: ["continued"],
  continued: [],
  stale: [],
};

export function canTransitionUiComponentInterrupt(
  from: UiComponentInterruptState,
  to: UiComponentInterruptState,
): boolean {
  return UI_COMPONENT_INTERRUPT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function transitionUiComponentInterrupt(
  from: UiComponentInterruptState,
  to: UiComponentInterruptState,
): UiComponentInterruptState {
  if (!canTransitionUiComponentInterrupt(from, to)) {
    throw new Error(`Invalid UI component interrupt transition: ${from} -> ${to}`);
  }
  return to;
}

/** Controlled UI interaction edges; every terminal state is closed. */
export const UI_INTERACTION_TRANSITIONS: Record<UiInteractionState, readonly UiInteractionState[]> =
  {
    prepared: ["token_issued", "stale"],
    token_issued: ["dispatching", "succeeded", "failed", "denied", "stale"],
    dispatching: ["succeeded", "failed", "denied", "stale"],
    succeeded: [],
    failed: [],
    denied: [],
    stale: [],
  };

export function canTransitionUiInteraction(
  from: UiInteractionState,
  to: UiInteractionState,
): boolean {
  return UI_INTERACTION_TRANSITIONS[from]?.includes(to) ?? false;
}

export function transitionUiInteraction(
  from: UiInteractionState,
  to: UiInteractionState,
): UiInteractionState {
  if (!canTransitionUiInteraction(from, to)) {
    throw new Error(`Invalid UI interaction transition: ${from} -> ${to}`);
  }
  return to;
}
