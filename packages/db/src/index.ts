export const DATABASE_ADAPTER = "postgres-drizzle" as const;

export type DatabaseAdapter = typeof DATABASE_ADAPTER;

export const P0_MIGRATION = "0001_p0_foundation.sql" as const;

export function describeDatabaseAdapter(): {
  adapter: DatabaseAdapter;
  migrations: typeof P0_MIGRATION;
} {
  return { adapter: DATABASE_ADAPTER, migrations: P0_MIGRATION };
}

export { createDb, createSql, databaseUrl, DEFAULT_DATABASE_URL } from "./client";
export { migrate, rollbackLast, listForwardMigrations, MIGRATIONS_DIR } from "./migrate";
export * from "./schema";
export {
  TURN_QUEUE_INPUT_TYPES,
  TURN_QUEUE_PRIORITY,
  enqueueTurnQueueItem,
  claimTurnQueueItem,
  heartbeatTurnQueueLease,
  reclaimExpiredTurnQueueLease,
  listClaimableQueueItems,
} from "./turn-queue";
export type {
  TurnQueueInputType,
  EnqueueTurnQueueItemInput,
  ClaimTurnQueueItemInput,
  ClaimTurnQueueItemResult,
  SqlClient as TurnQueueSqlClient,
} from "./turn-queue";
export {
  bindTrueForgeTurnId,
  markAgentTurnUncertain,
  ingestNormalizedTrueForgeEvent,
  lockAgentTurnForCreate,
} from "./turn-lifecycle";
export type {
  NormalizedRunEventInput,
  TurnDoneOutcomeInput,
  IngestRunEventResult,
} from "./turn-lifecycle";
export {
  requestRunStepStop,
  markCancelCalled,
  settleCancelledStep,
  sessionHasCancellingStep,
  enqueueCorrectionForStep,
  markActiveTurnsNeedsAttentionOnRestart,
} from "./run-control";
export type { RequestStopResult, StoppableStepState } from "./run-control";
export {
  createDirectMultiAgentRun,
  refreshRunLifecycle,
  refreshRunLifecycleForStep,
  loadRunProjection,
  aggregateRunFromStepsLocal,
  applyRunLifecycleProjection,
} from "./multi-agent-run";
export type {
  CreateDirectMultiAgentRunInput,
  CreateDirectMultiAgentRunResult,
  CreateDirectMultiAgentRunStepInput,
} from "./multi-agent-run";
export {
  publishWorkspaceRegistry,
  setComponentGrant,
  hasActiveComponentGrant,
  listPublishedComponentVersions,
  appendComponentAuditEvent,
  applyComponentGrantChange,
} from "./component-registry";
export type {
  SqlClient as ComponentRegistrySqlClient,
  ComponentRegistryDefinition,
  PublishedComponentVersion,
  SetComponentGrantInput,
  SetComponentGrantResult,
  HasActiveComponentGrantInput,
  AppendComponentAuditEventInput,
  ApplyComponentGrantChangeInput,
  ApplyComponentGrantChangeResult,
} from "./component-registry";
