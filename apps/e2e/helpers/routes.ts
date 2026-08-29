/** Stable prototype routes and seeded IDs for fixture-mode E2E. */
export const FIXTURE = {
  workspaceId: "workspace_1",
  channelGeneral: "ch_general_001",
  channelOps: "ch_ops_002",
  ownerEmail: "owner@example.test",
  demoRunId: "run_4A91",
} as const;

export function channelPath(channelId: string = FIXTURE.channelGeneral): string {
  return `/w/${FIXTURE.workspaceId}/channels/${channelId}`;
}

export function coworkersPath(): string {
  return `/w/${FIXTURE.workspaceId}/coworkers`;
}

export function tasksPath(): string {
  return `/w/${FIXTURE.workspaceId}/tasks`;
}
