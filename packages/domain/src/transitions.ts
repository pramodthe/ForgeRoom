import type { CoworkerDraftState } from "@forgeroom/contracts";
import type { RunLifecycle, RunStepState } from "@forgeroom/contracts";
import type { TaskStatus } from "@forgeroom/contracts";

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
