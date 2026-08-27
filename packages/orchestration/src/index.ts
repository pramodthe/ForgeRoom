export type WorkerHandle = {
  readonly kind: "worker";
  readonly embedded: boolean;
  stop: () => Promise<void>;
};

export type WorkerStartOptions = {
  embedded?: boolean;
};

export function startWorker(options: WorkerStartOptions = {}): WorkerHandle {
  const embedded = options.embedded ?? false;

  return {
    kind: "worker",
    embedded,
    async stop() {
      return;
    },
  };
}

export {
  CHANNEL_CONTEXT_VERSION,
  MAX_CHANNEL_CONTEXT_BYTES,
  MAX_CONTEXT_SUMMARY_CHARS,
  MAX_CONTEXT_PINS,
  MAX_CONTEXT_ARTIFACTS,
  MAX_RECENT_DELTAS,
  MAX_DELTA_SUMMARY_CHARS,
  MAX_HUMAN_REQUEST_CHARS,
  UNTRUSTED_CONTENT_NOTICE,
  buildChannelContextEnvelope,
  renderChannelContextText,
  nextDeliveryCursor,
  envelopeDeliveredThroughSequence,
  measureChannelContextBytes,
} from "./context-envelope";
export type {
  BuildChannelContextInput,
  TurnCreationStatus,
  DeliveryCursorAdvanceInput,
  DeliveryCursorAdvanceResult,
} from "./context-envelope";
export {
  TEAM_MENTION,
  AVAILABLE_CHANNEL_AGENT_SESSION_STATES,
  extractMentionTokens,
  isChannelAgentSessionAvailable,
  resolveMessageRecipients,
} from "./router";
export type { MentionRouterCoworker, ResolveMessageRecipientsInput } from "./router";
export {
  TURN_QUEUE_INPUT_TYPES,
  TURN_QUEUE_PRIORITY,
  priorityForInputType,
  evaluateClaimEligibility,
  resolveClaimGenerationBinding,
  compareClaimOrder,
} from "./turn-queue";
export type {
  TurnQueueInputType,
  ChannelAgentSessionClaimState,
  ClaimEligibility,
} from "./turn-queue";
export {
  redactSensitiveFields,
  normalizeTrueForgeEvent,
  evaluateTurnDoneOutcome,
} from "./event-normalize";
export type { NormalizedRunEvent, TurnDoneOutcome } from "./event-normalize";
export {
  hashCanonical,
  mapToolRiskToProposalRisk,
  extractRawRequiredActions,
  classifyRequiredActionType,
  buildPauseGroupCapturePlan,
  buildApprovalRedactionResult,
  sessionAcceptsInputWhilePaused,
} from "./pause-group";
export type {
  RawRequiredAction,
  CapturedActionType,
  ApprovalRedactionResult,
  ApprovalRedactionAdapter,
  ActingIdentityJson,
  PauseGroupCaptureAction,
  PauseGroupCapturePlan,
  PauseGroupCaptureFailure,
} from "./pause-group";
export {
  buildResponseOnlyTurnInput,
  assertResponseOnlyNoNormalMessage,
  decideCreateOrReconcileResponseTurn,
  authorizeAgUiPauseGroupResume,
  ciphertextExpiryAt,
  PAUSE_CIPHERTEXT_RECOVERY_WINDOW_MS,
} from "./pause-resume";
export type {
  PauseResumeResponseItem,
  BuildResponseOnlyTurnInputArgs,
  AgUiResumeInterrupt,
  ResponseTurnCreateOrReconcileDecision,
} from "./pause-resume";
export {
  decideStop,
  normalMessageImpliesStop,
  buildCorrectionQueueIntent,
  markNeedsAttentionOnRestart,
  RESTART_ACTIVE_TURN_STATES,
  dedupeReplayEnvelopes,
  blocksNewRemoteTurn,
  renderInFlightMcpOutcome,
} from "./stop-correction";
export type {
  StoppableStepState,
  StopDecision,
  CorrectionQueueIntent,
  RestartTurnMark,
  McpInFlightOutcome,
} from "./stop-correction";
export {
  planDirectRunSteps,
  activityBucketForStepState,
  aggregateRunFromSteps,
  buildCoworkerTurnInputRef,
  humanTranscriptProjectionCount,
} from "./multi-agent-run";
export type {
  DirectRunRecipient,
  DirectRunStepPlan,
  PlanDirectRunStepsResult,
  CoworkerTurnInputRef,
} from "./multi-agent-run";
export {
  dispatchPersistentCoworkerRealRead,
  projectSafeReadToolEvents,
  projectBlockedConnectionEvent,
  extractDirectToolObservationFromTrueForgeEvents,
  invokeDirectReadViaTrueForgeTurn,
  assertNoRawOrCredentials,
} from "./real-read";
export type {
  ProjectedToolActivityEvent,
  TrueForgeDirectToolObservation,
  RealReadDispatchAdapters,
  RealReadDispatchInput,
  RealReadDispatchResult,
  RealReadPreflightAdapterResult,
  RealReadSafeSummary,
} from "./real-read";
export {
  dispatchApprovalGatedDeterministicWrite,
  projectSafeWriteToolEvents,
  invokeDirectWriteViaTrueForgeTurn,
} from "./deterministic-write";
export type {
  SafeWriteSummary,
  DeterministicWriteDispatchAdapters,
  DeterministicWriteDispatchInput,
  DeterministicWriteDispatchResult,
  ApplicationResumeIntentAdapterResult,
} from "./deterministic-write";
export {
  intersectEffectiveTools,
  intersectEffectiveComponentTools,
  recheckComponentToolCall,
  decideSkillAttach,
  intersectPinnedSkills,
  isCapabilityRestriction,
} from "./capability-intersection";
export type {
  ConnectorCapabilitySlice,
  CapabilityIntersectionInput,
  EffectiveToolCapability,
  ControlledComponentCandidate,
  EffectiveComponentTool,
  SkillRequirementManifest,
  SkillAttachDecision,
} from "./capability-intersection";
export {
  planSessionRotation,
  decideQueueItemRebind,
  reconcileMcpDuringRotation,
  atomicGenerationSwapContract,
} from "./session-rotation";
export type {
  SessionRotationReason,
  SessionRotationPlan,
  QueueItemRebindDecision,
  AtomicGenerationSwapSteps,
} from "./session-rotation";
export { rotateChannelCoworkerSession } from "./session-rotator";
export type {
  RotateChannelCoworkerSessionInput,
  RotatedChannelCoworkerSession,
} from "./session-rotator";
export {
  assertNoSandboxSecrets,
  dispatchSandboxLifecycleProjection,
  projectSandboxActivitySnapshots,
  projectSandboxRunEvents,
} from "./sandbox";
export type {
  ProjectedSandboxActivity,
  ProjectedSandboxRunEvent,
  SandboxLifecycleDispatchResult,
} from "./sandbox";
export {
  createTrueForgeDownloadAdapter,
  executePublishSandboxArtifactCommand,
  projectArtifactActivitySnapshot,
  publishSandboxArtifactFromDiscovery,
} from "./artifact-extraction";
export type {
  ProjectedArtifactActivity,
  ProjectedArtifactRunEvent,
  PublishSandboxArtifactCommand,
  SandboxArtifactPublishAdapters,
  SandboxArtifactPublishInput,
  SandboxArtifactPublishResult,
} from "./artifact-extraction";
