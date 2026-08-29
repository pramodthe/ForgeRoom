/**
 * Maps ux.md required states to the primary UI surfaces that render them in P0.
 * Used for coverage tracking in P0-407; runtime AG-UI/component states are exercised in P0-408/P0-504.
 */
export const P0_REQUIRED_STATE_SURFACES = {
  "empty-workspace": "@forgeroom/ui-components EmptyState",
  "empty-channel": "channel workroom RouteErrorState",
  "queued-planning-running": "live-work-tab + channel timeline",
  "awaiting-question": "trusted-question-card",
  "awaiting-approval": "trusted-approval-card + pending-approvals-strip",
  "blocked-connection": "connections-page + channel header health",
  "permission-denied": "ForbiddenState + RouteErrorState",
  "cancelled-run": "run-detail-drawer + live-work-tab",
  "no-artifacts": "live-artifacts-tab empty",
  "unsupported-preview": "controlled instance incompatible state",
  "stale-approval": "trusted-approval-card stale notice",
  "completed-with-receipt": "run-detail-drawer receipt section",
  "component-preparing-streaming": "controlled presentation phases",
  "coworker-builder-lifecycle": "coworkers-page CoworkerBuilder stages",
  "task-conflict": "tasks-page TaskTransitionPanel conflict notice",
  "skill-draft-stale": "run-detail-drawer SaveAsSkillReview stale notice",
  "reconnecting-stream": "channel-timeline connection indicator",
  "ag-ui-resync": "use-channel-timeline gap resume + controlled presentation phases",
} as const satisfies Record<string, string>;

export type P0RequiredStateKey = keyof typeof P0_REQUIRED_STATE_SURFACES;

export function listP0RequiredStateKeys(): P0RequiredStateKey[] {
  return Object.keys(P0_REQUIRED_STATE_SURFACES) as P0RequiredStateKey[];
}
