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
export { persistPauseGroupCapture, sessionHasUnresolvedPauseGroup } from "./pause-group";
export type {
  PersistPauseGroupCaptureInput,
  PersistPauseGroupCaptureResult,
  PersistPauseGroupAction,
  PersistPauseGroupApprovalAction,
  PersistPauseGroupQuestionAction,
  PersistPauseGroupConnectionAction,
  SqlClient as PauseGroupSqlClient,
} from "./pause-group";
export {
  requestRunStepStop,
  findRemoteActiveTurnForSession,
  markCancelCalled,
  settleCancelledStep,
  sessionHasCancellingStep,
  enqueueCorrectionForStep,
  markActiveTurnsNeedsAttentionOnRestart,
} from "./run-control";
export type { RequestStopResult, StoppableStepState, RemoteActiveTurn } from "./run-control";
export {
  createDirectMultiAgentRun,
  refreshRunLifecycle,
  refreshRunLifecycleForStep,
  loadRunProjection,
  aggregateRunFromStepsLocal,
  applyRunLifecycleProjection,
} from "./multi-agent-run";
export { loadRunDetail, type RunDetailRecord } from "./run-detail";
export {
  loadAgentTurnCreateContext,
  markComponentInterruptContinued,
  type AgentTurnCreateContext,
} from "./agent-turn-create-context";
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
export {
  loadControlledComponentCandidates,
  loadCurrentSessionComponentToolNames,
} from "./component-candidates";
export type { ControlledComponentCandidateRow } from "./component-candidates";
export {
  loadComponentOfferContext,
  loadComponentToolGenerationContext,
  loadPublishedComponentVersionForStableName,
  createBuildingComponentUiInstance,
  brokerComponentToolMcpCall,
  recheckBrokerComponentAuthority,
  finalizeOrQuarantineUiInstance,
  applyScopedUiInteractionWorker,
} from "./component-tool-gateway";
export type {
  ComponentOfferContext,
  ComponentGatewayResult,
  ComponentToolGenerationContext,
  ComponentToolMcpBrokerResult,
  BrokerComponentAuthoritySnapshot,
} from "./component-tool-gateway";
export {
  recordApprovalDecision,
  loadApprovalProposalForCard,
  listPendingApprovalProposalIds,
} from "./approval-decision";
export type {
  ApprovalDecisionCommandInput,
  ApprovalProposalCardSnapshot,
  RecordApprovalDecisionInput,
  RecordApprovalDecisionResult,
  SqlClient as ApprovalDecisionSqlClient,
} from "./approval-decision";
export { loadQuestionForCard, listPendingQuestionIds } from "./question-card";
export type { QuestionCardSnapshot, SqlClient as QuestionCardSqlClient } from "./question-card";
export {
  derivePausePayloadKey,
  sealPauseResponsePayload,
  openPauseResponsePayload,
} from "./pause-crypto";
export {
  assemblePauseResumePlaintext,
  claimPauseGroupResume,
  loadPauseResumeForCreate,
  markPauseResumeCreating,
  markPauseResumeUncertain,
  completePauseResume,
  expirePauseResumeCiphertexts,
  recordQuestionAnswer,
  loadPauseGroupRequiredActionIds,
  loadPauseGroupResumeGate,
  findPauseGroupByInterruptIds,
  PAUSE_CIPHERTEXT_RECOVERY_WINDOW_MS,
} from "./pause-resume";
export type {
  ResolvedPauseActionRow,
  PauseResumeResponsePlaintext,
  ClaimPauseGroupResumeInput,
  ClaimPauseGroupResumeResult,
  LoadPauseResumeForCreateResult,
  RecordQuestionAnswerInput,
  RecordQuestionAnswerResult,
  SqlClient as PauseResumeSqlClient,
} from "./pause-resume";
export {
  beginSessionRotation,
  abortSessionRotation,
  atomicSwapSessionGeneration,
  completeSessionRotation,
  nextSessionRevisionOrdinal,
  recordMcpRotationOutcome,
  listDrainableRetiredSessionGenerationIds,
  recordSessionGenerationMcpConnectorDeleted,
  listCoworkerChannelSessions,
} from "./session-rotation";
export type {
  SessionRotationReason,
  SessionRevisionInsert,
  GenerationInsert,
  BeginSessionRotationInput,
  BeginSessionRotationResult,
  AtomicSwapSessionGenerationInput,
  AtomicSwapSessionGenerationResult,
  CompleteSessionRotationInput,
  RecordMcpRotationOutcomeInput,
  SqlClient as SessionRotationSqlClient,
} from "./session-rotation";
export {
  ConnectorBindingWorkspaceConflictError,
  ensureP0ConnectorBinding,
  loadConnectorBinding,
  listWorkspaceConnectorBindings,
  updateConnectorBindingStatus,
} from "./connector-bindings";
export {
  deleteExpiredConnectionReconnectIntents,
  findReconnectIntentByIdempotencyKey,
  findActiveReconnectIntentForActor,
  findLatestReconnectIntentForActor,
  findLatestReconnectIntentForConnection,
  saveConnectionReconnectIntent,
} from "./connection-reconnect-intents";
export type { StoredReconnectIntent } from "./connection-reconnect-intents";
export type { ConnectorBindingRow, EnsureP0ConnectorBindingInput } from "./connector-bindings";
export {
  findArtifactByContentRevision,
  loadArtifactById,
  publishArtifactRecord,
} from "./artifact-storage";
export { loadUiInstanceReplayBundle, toUiInstanceReplayResponse } from "./ui-instances";
export type { UiInstanceReplayBundle } from "./ui-instances";
export {
  issueUiInteractionToken,
  commitUiInteraction,
  validatePropsAgainstParameterSchema,
} from "./ui-interactions";
export { invokeUiDataFunction } from "./ui-data-functions";
export type { InvokeUiDataFunctionInput, InvokeUiDataFunctionResult } from "./ui-data-functions";
export type {
  IssueUiInteractionToken,
  IssueUiInteractionTokenInput,
  CommitUiInteractionInput,
  StoredInteractionResult,
  UiInteractionDbError,
  UiInteractionDbResult,
} from "./ui-interactions";
export { loadSandboxArtifactDiscoveryBinding } from "./artifact-discovery-binding";
export type { ArtifactDiscoveryBinding } from "./artifact-discovery-binding";
export type {
  ArtifactRecord,
  PublishArtifactRecordInput,
  PublishArtifactRecordResult,
} from "./artifact-storage";
