import type {
  AgentChannelEnvelope,
  CoworkerDraftState,
  CoworkerEffectivePreview,
  CoworkerProposal,
  P0PersistedAguiEvent,
  SessionResponse,
  TaskRecordOperation,
  TaskStatus,
} from "@forgeroom/contracts";
import type { TaskRecordV1, TaskRevision } from "@forgeroom/contracts";
import { clampEventLimit } from "./event-read";
import { materializeChannelEvent } from "./event-persist";

export type ChannelStatus = "active" | "archived";
export type CoworkerStatus = "active" | "disabled";
export type ChannelAgentSessionState = "active" | "rotating" | "disabled";

export type CoworkerEditableConfig = {
  standing_instructions: string;
  model_preset: string;
  budget: { max_turn_tokens: number; max_tool_calls: number };
  channel_ids: string[];
  task_record_grants: Array<{ channel_id: string; operations: TaskRecordOperation[] }>;
  tool_grants: string[];
  skill_version_ids: string[];
  component_version_ids: string[];
  /** When true, compiled TrueForge AgentSpec enables sandbox. */
  sandbox?: boolean;
};

export type ChannelRecord = {
  id: string;
  workspaceId: string;
  name: string;
  missionBrief: string;
  summary: string | null;
  policyJson: Record<string, unknown>;
  nextSequence: number;
  status: ChannelStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ChannelPatch = {
  name?: string;
  missionBrief?: string;
  summary?: string | null;
  policyJson?: Record<string, unknown>;
  status?: ChannelStatus;
  updatedAt: string;
};

export type ParticipantRecord = {
  channelId: string;
  participantType: "human" | "coworker";
  participantId: string;
  role: string;
  joinedAt: string;
  removedAt: string | null;
};

export type CoworkerRecord = {
  id: string;
  workspaceId: string;
  handle: string;
  name: string;
  title: string;
  avatarSeed: string | null;
  visibility: "workspace";
  status: CoworkerStatus;
  editableConfigJson: CoworkerEditableConfig;
  currentVersionId: string | null;
  configRevision: number;
  nativeSubagentsEnabled: false;
  createdAt: string;
  updatedAt: string;
};

export type AgentVersionRecord = {
  id: string;
  agentProfileId: string;
  version: number;
  configJson: Record<string, unknown>;
  specHash: string;
  createdBy: string;
  createdAt: string;
};

export type TaskGrantRecord = {
  id: string;
  taskId: string | null;
  channelId: string;
  subjectType: "coworker";
  subjectId: string;
  allowedOperationsJson: string[];
  allowedFieldsJson: string[];
  allowedTransitionsJson: Array<{ from: TaskStatus; to: TaskStatus }>;
  policyRevision: number;
  grantedBy: string;
  createdAt: string;
  revokedAt: string | null;
};

export type TaskRecord = TaskRecordV1;
export type TaskRevisionRecord = TaskRevision;

export type RunProvenanceRecord = {
  id: string;
  workspaceId: string;
  channelId: string;
};

export type AuditEventRecord = {
  id: string;
  workspaceId: string;
  channelId: string | null;
  actorType: "human" | "coworker" | "system";
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  redactedPayloadJson: Record<string, unknown>;
  payloadHash: string;
  createdAt: string;
};

export type TaskWriteFailureReason =
  "not_found" | "conflict" | "channel_archived" | "invalid_provenance" | "invalid_assignee";

export type TaskWriteResult =
  | {
      ok: true;
      task: TaskRecord;
      revision: TaskRevisionRecord;
      event: AppendChannelEventResult;
    }
  | {
      ok: false;
      reason: TaskWriteFailureReason;
      actualRevision?: number;
    };

export type ChannelEventRecord = {
  id: string;
  channelId: string;
  sequence: number;
  type: string;
  actorType: "human" | "coworker" | "system";
  actorId: string;
  runId: string | null;
  /**
   * Durable JSON — preferably a validated AgentChannelEnvelope.
   * Legacy rows may store audit payloads; readers must normalize via envelopeFromStoredEvent.
   */
  payloadJson: unknown;
  aguiEventType: string | null;
  aguiEventJson: P0PersistedAguiEvent | null;
  logicalThreadId: string | null;
  createdAt: string;
  /** Populated when joined from messages.event_id for legacy message.created reconstruction. */
  sourceMessageId?: string | null;
};

export type ListEventsAfterOptions = {
  limit?: number;
};

export type ListEventsAfterResult = {
  events: ChannelEventRecord[];
  /** True when more rows exist after the last returned sequence. */
  hasMore: boolean;
};

export type ChannelEventInsert = {
  id: string;
  type: string;
  actorType: "human" | "coworker" | "system";
  actorId: string;
  runId?: string | null;
  logicalThreadId?: string | null;
  createdAt: string;
  /** Correlation + nested AG-UI event; channelSequence is assigned inside the append transaction. */
  draft: {
    actorKind: AgentChannelEnvelope["actorKind"];
    applicationRunId?: string;
    runStepId?: string;
    agentTurnId?: string;
    aguiRunId?: string;
    coworkerId?: string;
    logicalThreadId?: string;
    sourceMessageId?: string;
    aguiEvent: P0PersistedAguiEvent;
  };
};

export type AppendChannelEventResult = {
  sequence: number;
  channel: ChannelRecord;
  envelope: AgentChannelEnvelope;
  event: ChannelEventRecord;
};

export type MessageRecord = {
  id: string;
  channelId: string;
  eventId: string;
  authorType: "human" | "coworker" | "system";
  authorId: string;
  body: string;
  parentMessageId: string | null;
  createdAt: string;
};

export type PinRecord = {
  id: string;
  channelId: string;
  sourceEventId: string | null;
  sourceArtifactId: string | null;
  label: string;
  pinnedBy: string;
  createdAt: string;
  removedAt: string | null;
};

/** Safe artifact reference for pins/context — never includes storage credentials or sandbox paths. */
export type SafeArtifactRecord = {
  id: string;
  workspaceId: string;
  channelId: string;
  runId: string;
  runStepId: string;
  creatorAgentId: string;
  kind: "file" | "preview";
  name: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  revision: number;
  createdAt: string;
};

export type ChannelAgentSessionRecord = {
  id: string;
  workspaceId: string;
  channelId: string;
  agentProfileId: string;
  logicalAguiThreadId: string;
  currentGenerationId: string | null;
  lastDeliveredChannelSequence: number;
  state: ChannelAgentSessionState;
  createdAt: string;
  updatedAt: string;
};

/** Seed/upsert input for routing tests and cursor proofs. */
export type ChannelAgentSessionUpsertInput = Pick<
  ChannelAgentSessionRecord,
  "id" | "workspaceId" | "channelId" | "agentProfileId" | "state"
> &
  Partial<
    Pick<
      ChannelAgentSessionRecord,
      | "logicalAguiThreadId"
      | "currentGenerationId"
      | "lastDeliveredChannelSequence"
      | "createdAt"
      | "updatedAt"
    >
  >;

export type CommandReceipt = {
  workspaceId: string;
  commandKind: string;
  idempotencyKey: string;
  resultId: string;
  /** Fencing token that owns the in-progress lease. */
  leaseOwner: string;
  resultJson: unknown;
  createdAt: string;
};

/** Separates business resultId from lease owner inside the durable result_id column. */
export const RECEIPT_LEASE_SEP = "\u001f";

export function encodeReceiptResultId(resultId: string, leaseOwner: string): string {
  return `${resultId}${RECEIPT_LEASE_SEP}${leaseOwner}`;
}

export function decodeReceiptResultId(stored: string): { resultId: string; leaseOwner: string } {
  const index = stored.lastIndexOf(RECEIPT_LEASE_SEP);
  if (index === -1) {
    return { resultId: stored, leaseOwner: "" };
  }
  return {
    resultId: stored.slice(0, index),
    leaseOwner: stored.slice(index + RECEIPT_LEASE_SEP.length),
  };
}

/** Persist pin id + channel event sequence inside command receipt result_id for replay. */
export const PIN_RECEIPT_SEQ_SEP = "@seq:";

export function encodePinReceiptResultId(pinId: string, sequence: number): string {
  return `${pinId}${PIN_RECEIPT_SEQ_SEP}${sequence}`;
}

export function parsePinReceiptResultId(resultId: string): {
  pinId: string;
  sequence: number | null;
} {
  const index = resultId.lastIndexOf(PIN_RECEIPT_SEQ_SEP);
  if (index === -1) {
    return { pinId: resultId, sequence: null };
  }
  const raw = resultId.slice(index + PIN_RECEIPT_SEQ_SEP.length);
  if (!/^(0|[1-9][0-9]*)$/.test(raw)) {
    return { pinId: resultId, sequence: null };
  }
  return { pinId: resultId.slice(0, index), sequence: Number(raw) };
}

/** Stable idempotency target for pin create — binds workspace key to channel + source. */
export const PIN_CREATE_TARGET_PREFIX = "pin-create:";

export function pinCreateTargetId(
  channelId: string,
  sourceMessageId: string | null,
  sourceArtifactId: string | null,
): string {
  if (sourceMessageId) {
    return `${PIN_CREATE_TARGET_PREFIX}${channelId}:message:${sourceMessageId}`;
  }
  if (sourceArtifactId) {
    return `${PIN_CREATE_TARGET_PREFIX}${channelId}:artifact:${sourceArtifactId}`;
  }
  throw new Error("pin create requires exactly one source");
}

export function isPinCreateTargetId(resultId: string): boolean {
  return resultId.startsWith(PIN_CREATE_TARGET_PREFIX);
}

export type MembershipWriteResult =
  | { ok: true; coworker: CoworkerRecord; channel: ChannelRecord; event?: AppendChannelEventResult }
  | { ok: false; reason: "not_found" | "channel_archived" | "coworker_inactive" };

export type CoworkerMutationResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_found" | "conflict";
      actualRevision?: number;
      actualStatus?: CoworkerStatus;
    };

export type CoworkerUpdateResult =
  CoworkerMutationResult | { ok: false; reason: "channel_archived"; channelId: string };

export type CoworkerDraftRecord = {
  id: string;
  workspaceId: string;
  revision: number;
  draftHash: string;
  policyRevision: number;
  catalogRevision: number;
  state: CoworkerDraftState;
  proposal: CoworkerProposal;
  effectivePreview: CoworkerEffectivePreview;
  sourceTextEncrypted: string;
  createdBy: string;
  expiresAt: string;
  createdAt: string;
  decidedAt: string | null;
  /** Memory/postgres helper for idempotent confirm replay within a process. */
  confirmIdempotencyKey?: string | null;
  provisionedCoworkerId?: string | null;
};

export type CoworkerDraftWriteResult =
  | { ok: true; draft: CoworkerDraftRecord; coworker?: CoworkerRecord }
  | {
      ok: false;
      reason: "not_found" | "stale" | "expired" | "invalid_state" | "handle_conflict";
      draft?: CoworkerDraftRecord;
      coworker?: CoworkerRecord;
    };

export type ProvisionCoworkerFromDraftInput = {
  draftId: string;
  expectedRevision: number;
  expectedHash: string;
  expectedPolicyRevision: number;
  expectedCatalogRevision: number;
  actorId: string;
  idempotencyKey: string;
  now: string;
  coworkerId: string;
  versionId: string;
  createdAt: string;
  specHash: string;
};

export type WorkspaceCatalogStore = {
  getChannel(id: string): Promise<ChannelRecord | null>;
  listChannels(workspaceId: string): Promise<ChannelRecord[]>;
  insertChannel(channel: ChannelRecord): Promise<void>;
  /** Updates metadata only — never overwrites nextSequence. */
  patchChannel(id: string, patch: ChannelPatch): Promise<ChannelRecord | null>;

  getTask(id: string): Promise<TaskRecord | null>;
  getRunProvenance(id: string): Promise<RunProvenanceRecord | null>;
  /**
   * Register a run's workspace/channel scope for memory-backed execution.
   * Durable stores create full runs through the orchestration transaction and
   * do not need this lightweight provenance hook.
   */
  recordRunProvenance?(run: RunProvenanceRecord): Promise<void>;
  listAuditEvents(workspaceId: string, targetId?: string): Promise<AuditEventRecord[]>;
  appendAuditEvent(audit: AuditEventRecord): Promise<void>;
  listTasks(channelId: string): Promise<TaskRecord[]>;
  listTaskHistory(taskId: string): Promise<TaskRevisionRecord[]>;
  insertTaskWithRevision(input: {
    task: TaskRecord;
    revision: TaskRevisionRecord;
    event: ChannelEventInsert;
    audit: AuditEventRecord;
  }): Promise<TaskWriteResult>;
  updateTaskWithRevision(input: {
    task: TaskRecord;
    revision: TaskRevisionRecord;
    expectedRevision: number;
    event: ChannelEventInsert;
    audit: AuditEventRecord;
  }): Promise<TaskWriteResult>;

  listParticipants(channelId: string): Promise<ParticipantRecord[]>;
  getParticipant(
    channelId: string,
    participantType: "human" | "coworker",
    participantId: string,
  ): Promise<ParticipantRecord | null>;
  upsertParticipant(participant: ParticipantRecord): Promise<void>;
  /**
   * Atomically locks channel+coworker, rejects archived channels, merges channel_ids
   * from the locked coworker row, and writes the participant row.
   * When `event` is provided, sequence allocation + channel_events insert share the same transaction.
   */
  upsertParticipantMembership(input: {
    participant: ParticipantRecord;
    coworkerId: string;
    coworkerUpdatedAt: string;
    channelOp: { type: "add"; channelId: string } | { type: "remove"; channelId: string };
    event?: ChannelEventInsert;
  }): Promise<MembershipWriteResult>;

  getCoworker(id: string): Promise<CoworkerRecord | null>;
  listCoworkers(workspaceId: string): Promise<CoworkerRecord[]>;
  /** Current channel/coworker session rows used for routing availability (may be empty pre-P0-201). */
  listChannelAgentSessions(channelId: string): Promise<ChannelAgentSessionRecord[]>;
  /** Upsert stable logical session row; production writers also call persistProvisionedSession. */
  upsertChannelAgentSession(session: ChannelAgentSessionUpsertInput): Promise<void>;
  /** Persist SessionRevision + immutable generation and point the logical session at it. */
  persistProvisionedSession(input: {
    logicalSession: ChannelAgentSessionRecord;
    revision: {
      id: string;
      agentProfileId: string;
      sourceConfigRevision: number;
      effectiveConfigRedactedJson: Record<string, unknown>;
      effectiveSpecHash: string;
      approvalPolicyHash: string;
      createdBy: string;
      createdAt: string;
    };
    generation: {
      id: string;
      channelAgentSessionId: string;
      generation: number;
      agentVersionId: string | null;
      sessionRevisionId: string;
      trueforgeSessionId: string;
      effectiveSpecHash: string;
      approvalPolicyHash: string;
      activeTurnId: string | null;
      state: string;
      createdAt: string;
      retiredAt: string | null;
    };
  }): Promise<void>;
  insertCoworker(coworker: CoworkerRecord, version: AgentVersionRecord): Promise<void>;
  updateCoworker(coworker: CoworkerRecord, version?: AgentVersionRecord): Promise<void>;
  /**
   * Atomically locks affected channels in deterministic order, rejects archived channels,
   * then locks the profile, requires expected revision+active status, and applies the update.
   */
  commitCoworkerUpdate(input: {
    coworker: CoworkerRecord;
    version: AgentVersionRecord;
    memberships: ParticipantRecord[];
    membershipEvents?: Array<{ channelId: string; event: ChannelEventInsert }>;
    taskGrants: TaskGrantRecord[];
    revokeGrantsAt: string;
    expectedConfigRevision: number;
    expectedStatus: "active";
  }): Promise<CoworkerUpdateResult & { events?: AppendChannelEventResult[] }>;
  /**
   * Atomically locks the profile, requires expected revision, then disables,
   * revokes grants, and removes every active coworker membership under that lock.
   */
  disableCoworkerCleanup(input: {
    coworker: CoworkerRecord;
    revokeAt: string;
    expectedConfigRevision: number;
    removalEvents?: Array<{ channelId: string; event: ChannelEventInsert }>;
  }): Promise<CoworkerMutationResult & { events?: AppendChannelEventResult[] }>;

  listActiveTaskGrantsForSubject(subjectId: string): Promise<TaskGrantRecord[]>;
  replaceActiveTaskGrantsForSubject(
    subjectId: string,
    grants: TaskGrantRecord[],
    revokedAt: string,
  ): Promise<void>;

  getMessage(id: string): Promise<MessageRecord | null>;
  getMessageByEventId(eventId: string): Promise<MessageRecord | null>;
  listMessages(
    channelId: string,
    limit?: number,
  ): Promise<Array<MessageRecord & { channelSequence: number }>>;

  getPin(id: string): Promise<PinRecord | null>;
  listActivePins(channelId: string): Promise<PinRecord[]>;
  findActivePinBySource(input: {
    channelId: string;
    sourceEventId?: string | null;
    sourceArtifactId?: string | null;
  }): Promise<PinRecord | null>;
  findPinBySource(input: {
    channelId: string;
    sourceEventId?: string | null;
    sourceArtifactId?: string | null;
  }): Promise<PinRecord | null>;

  getArtifact(id: string): Promise<SafeArtifactRecord | null>;
  listSafeArtifacts(channelId: string, workspaceId: string): Promise<SafeArtifactRecord[]>;
  /** Test/fixture helper — artifact storage pipeline is owned by later tasks. */
  insertArtifact(artifact: SafeArtifactRecord): Promise<void>;

  getChannelAgentSession(id: string): Promise<ChannelAgentSessionRecord | null>;
  /** Test/fixture helper for context cursor proofs. */
  upsertChannelAgentSession(session: ChannelAgentSessionUpsertInput): Promise<void>;
  /**
   * Persist a new delivery cursor when the caller has already decided the advance is valid
   * (confirmed/reconciled turn). Never called for pending/uncertain creation.
   */
  setSessionDeliveryCursor(
    sessionId: string,
    nextSequence: number,
    updatedAt: string,
  ): Promise<ChannelAgentSessionRecord | null>;

  listEventsAfter(
    channelId: string,
    afterSequence: number,
    options?: ListEventsAfterOptions,
  ): Promise<ListEventsAfterResult>;

  getCommandReceipt(
    workspaceId: string,
    commandKind: string,
    idempotencyKey: string,
  ): Promise<CommandReceipt | null>;
  /** Insert receipt; returns false if the idempotency key already exists. */
  tryClaimCommandReceipt(receipt: CommandReceipt): Promise<boolean>;
  /** Heartbeat: refresh created_at only when leaseOwner still owns the claim. */
  touchCommandReceipt(
    workspaceId: string,
    commandKind: string,
    idempotencyKey: string,
    leaseOwner: string,
    touchedAt: string,
  ): Promise<boolean>;
  /**
   * Delete an in-progress claim only if its created_at is strictly older than cutoff.
   * Returns true when a row was removed (safe to reclaim).
   */
  reclaimStaleCommandReceipt(
    workspaceId: string,
    commandKind: string,
    idempotencyKey: string,
    olderThanIso: string,
  ): Promise<boolean>;
  /** Delete only when leaseOwner matches the current claim owner. */
  deleteCommandReceipt(
    workspaceId: string,
    commandKind: string,
    idempotencyKey: string,
    leaseOwner: string,
  ): Promise<void>;
  /**
   * After a successful mutation, rebind the durable result_id while the lease owner still holds
   * the claim (used to persist pin event sequence for idempotent replay).
   */
  rebindCommandReceiptResultId(
    workspaceId: string,
    commandKind: string,
    idempotencyKey: string,
    leaseOwner: string,
    nextResultId: string,
  ): Promise<boolean>;
  /** Persist the exact successful command response while the lease owner holds the claim. */
  completeCommandReceipt(
    workspaceId: string,
    commandKind: string,
    idempotencyKey: string,
    leaseOwner: string,
    resultJson: unknown,
  ): Promise<boolean>;

  /**
   * Insert channel + owner + channel.created event (sequence 0) atomically.
   * Channel.nextSequence must be 1 (next free after the create event).
   */
  insertChannelWithOwner(
    channel: ChannelRecord,
    owner: ParticipantRecord,
    createdEvent: ChannelEventInsert,
  ): Promise<AppendChannelEventResult>;

  /**
   * Lock channel, allocate sequence, insert channel_events (+ optional message / patch)
   * in one transaction.
   */
  appendChannelEvent(input: {
    channelId: string;
    event: ChannelEventInsert;
    message?: MessageRecord;
    channelPatch?: ChannelPatch;
    participantUpsert?: ParticipantRecord;
    /** When true, allow append on an already-archived channel (idempotent archive). */
    allowArchived?: boolean;
  }): Promise<AppendChannelEventResult>;

  appendMessage(input: {
    channelId: string;
    event: ChannelEventInsert;
    message: MessageRecord;
  }): Promise<AppendChannelEventResult>;

  /** Lock channel, append pin.created event, insert pin row. */
  createPinWithEvent(input: {
    channelId: string;
    event: ChannelEventInsert;
    pin: PinRecord;
  }): Promise<AppendChannelEventResult & { pin: PinRecord }>;

  /** Lock channel, append pin.removed event, soft-delete pin. */
  removePinWithEvent(input: {
    channelId: string;
    event: ChannelEventInsert;
    pinId: string;
    removedAt: string;
  }): Promise<AppendChannelEventResult & { pin: PinRecord }>;

  insertCoworkerDraft(draft: CoworkerDraftRecord): Promise<void>;
  getCoworkerDraft(id: string): Promise<CoworkerDraftRecord | null>;
  listCoworkerDrafts(workspaceId: string): Promise<CoworkerDraftRecord[]>;
  supersedeCoworkerDrafts(input: {
    workspaceId: string;
    supersededBefore: string;
    exceptDraftId: string;
  }): Promise<void>;
  updateCoworkerDraftState(input: {
    draftId: string;
    expectedRevision: number;
    nextState: CoworkerDraftState;
    decidedAt?: string | null;
    confirmIdempotencyKey?: string | null;
    provisionedCoworkerId?: string | null;
  }): Promise<CoworkerDraftRecord | null>;
  provisionCoworkerFromDraft(
    input: ProvisionCoworkerFromDraftInput,
  ): Promise<CoworkerDraftWriteResult>;
};

export function emptyEditableConfig(): CoworkerEditableConfig {
  return {
    standing_instructions: "",
    model_preset: "default",
    budget: { max_turn_tokens: 12_000, max_tool_calls: 20 },
    channel_ids: [],
    task_record_grants: [],
    tool_grants: [],
    skill_version_ids: [],
    component_version_ids: [],
  };
}

export function createMemoryWorkspaceStore(): WorkspaceCatalogStore {
  const channels = new Map<string, ChannelRecord>();
  const participants = new Map<string, ParticipantRecord>();
  const coworkers = new Map<string, CoworkerRecord>();
  const versions = new Map<string, AgentVersionRecord>();
  const taskGrants = new Map<string, TaskGrantRecord>();
  const receipts = new Map<string, CommandReceipt>();
  const coworkerDrafts = new Map<string, CoworkerDraftRecord>();
  let draftProvisionLock: Promise<void> = Promise.resolve();
  const events = new Map<string, ChannelEventRecord>();
  const messages = new Map<string, MessageRecord>();
  const pins = new Map<string, PinRecord>();
  const tasks = new Map<string, TaskRecord>();
  const taskRevisions = new Map<string, TaskRevisionRecord[]>();
  const runs = new Map<string, RunProvenanceRecord>();
  const auditEvents = new Map<string, AuditEventRecord>();
  const artifacts = new Map<string, SafeArtifactRecord>();
  const agentSessions = new Map<string, ChannelAgentSessionRecord>();
  const sessionRevisions = new Map<
    string,
    {
      id: string;
      agentProfileId: string;
      sourceConfigRevision: number;
      effectiveConfigRedactedJson: Record<string, unknown>;
      effectiveSpecHash: string;
      approvalPolicyHash: string;
      createdBy: string;
      createdAt: string;
    }
  >();
  const sessionGenerations = new Map<
    string,
    {
      id: string;
      channelAgentSessionId: string;
      generation: number;
      agentVersionId: string | null;
      sessionRevisionId: string;
      trueforgeSessionId: string;
      effectiveSpecHash: string;
      approvalPolicyHash: string;
      activeTurnId: string | null;
      state: string;
      createdAt: string;
      retiredAt: string | null;
    }
  >();
  /** Serialize per-channel appends so concurrent callers preserve unique monotonic sequences. */
  const channelLocks = new Map<string, Promise<void>>();

  async function withChannelLock<T>(channelId: string, fn: () => T | Promise<T>): Promise<T> {
    const previous = channelLocks.get(channelId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = previous.catch(() => undefined).then(() => gate);
    channelLocks.set(channelId, chained);
    await previous.catch(() => undefined);
    try {
      return await fn();
    } finally {
      release();
      if (channelLocks.get(channelId) === chained) {
        channelLocks.delete(channelId);
      }
    }
  }

  function participantKey(
    channelId: string,
    participantType: string,
    participantId: string,
  ): string {
    return `${channelId}:${participantType}:${participantId}`;
  }

  function receiptKey(workspaceId: string, commandKind: string, idempotencyKey: string): string {
    return `${workspaceId}:${commandKind}:${idempotencyKey}`;
  }

  function writeParticipant(participant: ParticipantRecord): void {
    participants.set(
      participantKey(participant.channelId, participant.participantType, participant.participantId),
      structuredClone(participant),
    );
  }

  function replaceGrants(subjectId: string, grants: TaskGrantRecord[], revokedAt: string): void {
    for (const [id, row] of taskGrants) {
      if (row.subjectId === subjectId && row.revokedAt === null) {
        taskGrants.set(id, { ...row, revokedAt });
      }
    }
    for (const grant of grants) {
      taskGrants.set(grant.id, structuredClone(grant));
    }
  }

  function mergeChannelIds(
    current: string[],
    op: { type: "add"; channelId: string } | { type: "remove"; channelId: string },
  ): string[] {
    if (op.type === "add") {
      return [...new Set([...current, op.channelId])];
    }
    return current.filter((id) => id !== op.channelId);
  }

  function validateTaskWrite(task: TaskRecord): TaskWriteFailureReason | null {
    const channel = channels.get(task.channel_id);
    if (!channel || channel.workspaceId !== task.workspace_id) {
      return "invalid_provenance";
    }
    if (channel.status === "archived") {
      return "channel_archived";
    }
    if (task.source_run_id) {
      const run = runs.get(task.source_run_id);
      if (!run || run.workspaceId !== task.workspace_id || run.channelId !== task.channel_id) {
        return "invalid_provenance";
      }
    }
    if (task.assignee_type === "coworker") {
      const coworker = task.assignee_id ? coworkers.get(task.assignee_id) : null;
      const participant = task.assignee_id
        ? participants.get(participantKey(task.channel_id, "coworker", task.assignee_id))
        : null;
      if (
        !coworker ||
        coworker.workspaceId !== task.workspace_id ||
        coworker.status !== "active" ||
        !participant ||
        participant.removedAt !== null
      ) {
        return "invalid_assignee";
      }
    }
    return null;
  }

  function appendEventLocked(input: {
    channelId: string;
    event: ChannelEventInsert;
    message?: MessageRecord;
    channelPatch?: ChannelPatch;
    participantUpsert?: ParticipantRecord;
    allowArchived?: boolean;
  }): AppendChannelEventResult {
    const channel = channels.get(input.channelId);
    if (!channel) {
      throw new Error(`channel ${input.channelId} not found`);
    }
    if (channel.status === "archived" && !input.allowArchived) {
      throw new Error("channel_archived");
    }
    const sequence = channel.nextSequence;
    const { envelope, event } = materializeChannelEvent(input.channelId, sequence, input.event);
    let updated: ChannelRecord = {
      ...channel,
      nextSequence: sequence + 1,
      updatedAt: input.event.createdAt,
    };
    if (input.channelPatch) {
      updated = {
        ...updated,
        name: input.channelPatch.name ?? updated.name,
        missionBrief: input.channelPatch.missionBrief ?? updated.missionBrief,
        summary:
          input.channelPatch.summary !== undefined ? input.channelPatch.summary : updated.summary,
        policyJson: input.channelPatch.policyJson ?? updated.policyJson,
        status: input.channelPatch.status ?? updated.status,
        updatedAt: input.channelPatch.updatedAt,
      };
    }
    channels.set(updated.id, structuredClone(updated));
    events.set(event.id, structuredClone(event));
    if (input.message) {
      messages.set(input.message.id, structuredClone(input.message));
    }
    if (input.participantUpsert) {
      writeParticipant(input.participantUpsert);
    }
    return {
      sequence,
      channel: structuredClone(updated),
      envelope,
      event: structuredClone(event),
    };
  }

  return {
    async getChannel(id) {
      return channels.get(id) ?? null;
    },
    async listChannels(workspaceId) {
      return [...channels.values()]
        .filter((row) => row.workspaceId === workspaceId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async insertChannel(channel) {
      channels.set(channel.id, structuredClone(channel));
    },
    async patchChannel(id, patch) {
      const current = channels.get(id);
      if (!current) {
        return null;
      }
      const updated: ChannelRecord = {
        ...current,
        name: patch.name ?? current.name,
        missionBrief: patch.missionBrief ?? current.missionBrief,
        summary: patch.summary !== undefined ? patch.summary : current.summary,
        policyJson: patch.policyJson ?? current.policyJson,
        status: patch.status ?? current.status,
        updatedAt: patch.updatedAt,
      };
      channels.set(id, structuredClone(updated));
      return structuredClone(updated);
    },
    async getTask(id) {
      const row = tasks.get(id);
      return row ? structuredClone(row) : null;
    },
    async getRunProvenance(id) {
      const row = runs.get(id);
      return row ? structuredClone(row) : null;
    },
    async recordRunProvenance(run) {
      const channel = channels.get(run.channelId);
      if (!channel || channel.workspaceId !== run.workspaceId) {
        throw new Error("run provenance must reference a channel in the same workspace");
      }
      const existing = runs.get(run.id);
      if (
        existing &&
        (existing.workspaceId !== run.workspaceId || existing.channelId !== run.channelId)
      ) {
        throw new Error("run provenance cannot change workspace or channel");
      }
      runs.set(run.id, structuredClone(run));
    },
    async listAuditEvents(workspaceId, targetId) {
      return [...auditEvents.values()]
        .filter(
          (row) => row.workspaceId === workspaceId && (!targetId || row.targetId === targetId),
        )
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((row) => structuredClone(row));
    },
    async appendAuditEvent(audit) {
      if (auditEvents.has(audit.id)) {
        throw new Error("audit event id already exists");
      }
      auditEvents.set(audit.id, structuredClone(audit));
    },
    async listTasks(channelId) {
      return [...tasks.values()]
        .filter((row) => row.channel_id === channelId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((row) => structuredClone(row));
    },
    async listTaskHistory(taskId) {
      return (taskRevisions.get(taskId) ?? [])
        .slice()
        .sort((a, b) => a.revision - b.revision)
        .map((row) => structuredClone(row));
    },
    async insertTaskWithRevision(input) {
      return withChannelLock(input.task.channel_id, () => {
        if (tasks.has(input.task.id)) return { ok: false, reason: "conflict" };
        const invalid = validateTaskWrite(input.task);
        if (invalid) return { ok: false, reason: invalid };
        const event = appendEventLocked({ channelId: input.task.channel_id, event: input.event });
        tasks.set(input.task.id, structuredClone(input.task));
        taskRevisions.set(input.task.id, [structuredClone(input.revision)]);
        auditEvents.set(input.audit.id, structuredClone(input.audit));
        return {
          ok: true,
          task: structuredClone(input.task),
          revision: structuredClone(input.revision),
          event,
        };
      });
    },
    async updateTaskWithRevision(input) {
      return withChannelLock(input.task.channel_id, () => {
        const current = tasks.get(input.task.id);
        if (!current) return { ok: false, reason: "not_found" };
        if (current.current_revision !== input.expectedRevision) {
          return {
            ok: false,
            reason: "conflict",
            actualRevision: current.current_revision,
          };
        }
        const invalid = validateTaskWrite(input.task);
        if (invalid) return { ok: false, reason: invalid };
        const event = appendEventLocked({ channelId: input.task.channel_id, event: input.event });
        tasks.set(input.task.id, structuredClone(input.task));
        taskRevisions.set(input.task.id, [
          ...(taskRevisions.get(input.task.id) ?? []),
          structuredClone(input.revision),
        ]);
        auditEvents.set(input.audit.id, structuredClone(input.audit));
        return {
          ok: true,
          task: structuredClone(input.task),
          revision: structuredClone(input.revision),
          event,
        };
      });
    },
    async listParticipants(channelId) {
      return [...participants.values()].filter((row) => row.channelId === channelId);
    },
    async getParticipant(channelId, participantType, participantId) {
      return participants.get(participantKey(channelId, participantType, participantId)) ?? null;
    },
    async upsertParticipant(participant) {
      writeParticipant(participant);
    },
    async upsertParticipantMembership(input) {
      return withChannelLock(input.channelOp.channelId, () => {
        const channelId = input.channelOp.channelId;
        const channel = channels.get(channelId);
        if (!channel) {
          return { ok: false, reason: "not_found" };
        }
        if (channel.status === "archived") {
          return { ok: false, reason: "channel_archived" };
        }
        const coworker = coworkers.get(input.coworkerId);
        if (!coworker) {
          return { ok: false, reason: "not_found" };
        }
        if (input.channelOp.type === "add" && coworker.status !== "active") {
          return { ok: false, reason: "coworker_inactive" };
        }
        let appended: AppendChannelEventResult | undefined;
        if (input.event) {
          appended = appendEventLocked({
            channelId,
            event: input.event,
          });
        }
        writeParticipant(input.participant);
        const updated: CoworkerRecord = {
          ...coworker,
          editableConfigJson: {
            ...coworker.editableConfigJson,
            channel_ids: mergeChannelIds(coworker.editableConfigJson.channel_ids, input.channelOp),
          },
          configRevision: coworker.configRevision + 1,
          updatedAt: input.coworkerUpdatedAt,
        };
        coworkers.set(updated.id, structuredClone(updated));
        const latestChannel = channels.get(channelId) ?? channel;
        return {
          ok: true,
          coworker: structuredClone(updated),
          channel: structuredClone(latestChannel),
          ...(appended ? { event: appended } : {}),
        };
      });
    },
    async getCoworker(id) {
      return coworkers.get(id) ?? null;
    },
    async listCoworkers(workspaceId) {
      return [...coworkers.values()]
        .filter((row) => row.workspaceId === workspaceId)
        .sort((a, b) => a.handle.localeCompare(b.handle));
    },
    async listChannelAgentSessions(channelId) {
      return [...agentSessions.values()]
        .filter((row) => row.channelId === channelId)
        .sort((a, b) => a.agentProfileId.localeCompare(b.agentProfileId));
    },
    async insertCoworker(coworker, version) {
      coworkers.set(coworker.id, structuredClone(coworker));
      versions.set(version.id, structuredClone(version));
    },
    async updateCoworker(coworker, version) {
      coworkers.set(coworker.id, structuredClone(coworker));
      if (version) {
        versions.set(version.id, structuredClone(version));
      }
    },
    async commitCoworkerUpdate(input) {
      const affectedChannelIds = [
        ...new Set([
          ...input.memberships.map((membership) => membership.channelId),
          ...(input.membershipEvents ?? []).map((row) => row.channelId),
        ]),
      ].sort();
      for (const channelId of affectedChannelIds) {
        const channel = channels.get(channelId);
        if (!channel || channel.workspaceId !== input.coworker.workspaceId) {
          return { ok: false, reason: "conflict" };
        }
        if (channel.status === "archived") {
          return { ok: false, reason: "channel_archived", channelId };
        }
      }
      const current = coworkers.get(input.coworker.id);
      if (!current) {
        return { ok: false, reason: "not_found" };
      }
      if (
        current.configRevision !== input.expectedConfigRevision ||
        current.status !== input.expectedStatus
      ) {
        return {
          ok: false,
          reason: "conflict",
          actualRevision: current.configRevision,
          actualStatus: current.status,
        };
      }
      const appended: AppendChannelEventResult[] = [];
      for (const membershipEvent of input.membershipEvents ?? []) {
        appended.push(
          appendEventLocked({
            channelId: membershipEvent.channelId,
            event: membershipEvent.event,
          }),
        );
      }
      for (const membership of input.memberships) {
        writeParticipant(membership);
      }
      replaceGrants(input.coworker.id, input.taskGrants, input.revokeGrantsAt);
      coworkers.set(input.coworker.id, structuredClone(input.coworker));
      versions.set(input.version.id, structuredClone(input.version));
      return { ok: true, ...(appended.length > 0 ? { events: appended } : {}) };
    },
    async disableCoworkerCleanup(input) {
      const current = coworkers.get(input.coworker.id);
      if (!current) {
        return { ok: false, reason: "not_found" };
      }
      if (current.status === "disabled") {
        // Already disabled — treat as success when revision matches the disabled head,
        // otherwise conflict so a stale disable cannot rewind state.
        if (current.configRevision === input.coworker.configRevision) {
          return { ok: true };
        }
        return {
          ok: false,
          reason: "conflict",
          actualRevision: current.configRevision,
          actualStatus: current.status,
        };
      }
      if (current.configRevision !== input.expectedConfigRevision) {
        return {
          ok: false,
          reason: "conflict",
          actualRevision: current.configRevision,
          actualStatus: current.status,
        };
      }
      const appended: AppendChannelEventResult[] = [];
      for (const removal of input.removalEvents ?? []) {
        appended.push(
          appendEventLocked({
            channelId: removal.channelId,
            event: removal.event,
            allowArchived: true,
          }),
        );
      }
      for (const [key, row] of participants) {
        if (
          row.participantType === "coworker" &&
          row.participantId === input.coworker.id &&
          row.removedAt === null
        ) {
          participants.set(key, { ...row, removedAt: input.revokeAt });
        }
      }
      replaceGrants(input.coworker.id, [], input.revokeAt);
      coworkers.set(input.coworker.id, structuredClone(input.coworker));
      return { ok: true, ...(appended.length > 0 ? { events: appended } : {}) };
    },
    async listActiveTaskGrantsForSubject(subjectId) {
      return [...taskGrants.values()].filter(
        (row) => row.subjectId === subjectId && row.revokedAt === null,
      );
    },
    async replaceActiveTaskGrantsForSubject(subjectId, grants, revokedAt) {
      replaceGrants(subjectId, grants, revokedAt);
    },
    async getMessage(id) {
      return messages.get(id) ?? null;
    },
    async getMessageByEventId(eventId) {
      return [...messages.values()].find((row) => row.eventId === eventId) ?? null;
    },
    async listMessages(channelId, limit = 200) {
      return [...messages.values()]
        .filter((row) => row.channelId === channelId)
        .sort((left, right) =>
          left.createdAt === right.createdAt
            ? left.id.localeCompare(right.id)
            : left.createdAt.localeCompare(right.createdAt),
        )
        .slice(-Math.min(Math.max(limit, 1), 200))
        .flatMap((row) => {
          const event = events.get(row.eventId);
          return event ? [{ ...structuredClone(row), channelSequence: event.sequence }] : [];
        });
    },
    async getPin(id) {
      const row = pins.get(id);
      return row ? structuredClone(row) : null;
    },
    async listActivePins(channelId) {
      return [...pins.values()]
        .filter((row) => row.channelId === channelId && row.removedAt === null)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((row) => structuredClone(row));
    },
    async findActivePinBySource(input) {
      return (
        [...pins.values()].find((row) => {
          if (row.channelId !== input.channelId || row.removedAt !== null) {
            return false;
          }
          if (input.sourceEventId) {
            return row.sourceEventId === input.sourceEventId;
          }
          if (input.sourceArtifactId) {
            return row.sourceArtifactId === input.sourceArtifactId;
          }
          return false;
        }) ?? null
      );
    },
    async findPinBySource(input) {
      return (
        [...pins.values()].find((row) => {
          if (row.channelId !== input.channelId) {
            return false;
          }
          if (input.sourceEventId) {
            return row.sourceEventId === input.sourceEventId;
          }
          if (input.sourceArtifactId) {
            return row.sourceArtifactId === input.sourceArtifactId;
          }
          return false;
        }) ?? null
      );
    },
    async getArtifact(id) {
      const row = artifacts.get(id);
      return row ? structuredClone(row) : null;
    },
    async listSafeArtifacts(channelId, workspaceId) {
      return [...artifacts.values()]
        .filter((row) => row.channelId === channelId && row.workspaceId === workspaceId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((row) => structuredClone(row));
    },
    async insertArtifact(artifact) {
      artifacts.set(artifact.id, structuredClone(artifact));
    },
    async getChannelAgentSession(id) {
      const row = agentSessions.get(id);
      return row ? structuredClone(row) : null;
    },
    async upsertChannelAgentSession(session: ChannelAgentSessionUpsertInput) {
      const now = new Date().toISOString();
      agentSessions.set(session.id, {
        ...session,
        logicalAguiThreadId:
          session.logicalAguiThreadId ?? `thread_${session.channelId}_${session.agentProfileId}`,
        currentGenerationId: session.currentGenerationId ?? null,
        lastDeliveredChannelSequence: session.lastDeliveredChannelSequence ?? 0,
        createdAt: session.createdAt ?? now,
        updatedAt: session.updatedAt ?? now,
      });
    },
    async persistProvisionedSession(input) {
      sessionRevisions.set(input.revision.id, structuredClone(input.revision));
      sessionGenerations.set(input.generation.id, structuredClone(input.generation));
      agentSessions.set(input.logicalSession.id, structuredClone(input.logicalSession));
    },
    async setSessionDeliveryCursor(sessionId, nextSequence, updatedAt) {
      const existing = agentSessions.get(sessionId);
      if (!existing) {
        return null;
      }
      // Monotonic GREATEST semantics (mirrors postgres).
      const nextValue = Math.max(existing.lastDeliveredChannelSequence, nextSequence);
      const next = {
        ...existing,
        lastDeliveredChannelSequence: nextValue,
        updatedAt:
          nextValue > existing.lastDeliveredChannelSequence ? updatedAt : existing.updatedAt,
      };
      agentSessions.set(sessionId, next);
      return structuredClone(next);
    },
    async listEventsAfter(channelId, afterSequence, options) {
      const limit = clampEventLimit(options?.limit);
      const rows = [...events.values()]
        .filter((row) => row.channelId === channelId && row.sequence > afterSequence)
        .sort((a, b) => a.sequence - b.sequence);
      const page = rows.slice(0, limit).map((row) => {
        const message = [...messages.values()].find((m) => m.eventId === row.id);
        return {
          ...structuredClone(row),
          sourceMessageId: message?.id ?? null,
        };
      });
      return {
        events: page,
        hasMore: rows.length > page.length,
      };
    },
    async getCommandReceipt(workspaceId, commandKind, idempotencyKey) {
      const existing = receipts.get(receiptKey(workspaceId, commandKind, idempotencyKey));
      return existing ? structuredClone(existing) : null;
    },
    async tryClaimCommandReceipt(receipt) {
      const key = receiptKey(receipt.workspaceId, receipt.commandKind, receipt.idempotencyKey);
      if (receipts.has(key)) {
        return false;
      }
      receipts.set(key, structuredClone(receipt));
      return true;
    },
    async touchCommandReceipt(workspaceId, commandKind, idempotencyKey, leaseOwner, touchedAt) {
      const key = receiptKey(workspaceId, commandKind, idempotencyKey);
      const existing = receipts.get(key);
      if (!existing || existing.leaseOwner !== leaseOwner) {
        return false;
      }
      receipts.set(key, { ...existing, createdAt: touchedAt });
      return true;
    },
    async reclaimStaleCommandReceipt(workspaceId, commandKind, idempotencyKey, olderThanIso) {
      const key = receiptKey(workspaceId, commandKind, idempotencyKey);
      const existing = receipts.get(key);
      if (!existing) {
        return false;
      }
      if (existing.createdAt >= olderThanIso) {
        return false;
      }
      receipts.delete(key);
      return true;
    },
    async deleteCommandReceipt(workspaceId, commandKind, idempotencyKey, leaseOwner) {
      const key = receiptKey(workspaceId, commandKind, idempotencyKey);
      const existing = receipts.get(key);
      if (!existing || existing.leaseOwner !== leaseOwner) {
        return;
      }
      receipts.delete(key);
    },
    async rebindCommandReceiptResultId(
      workspaceId,
      commandKind,
      idempotencyKey,
      leaseOwner,
      nextResultId,
    ) {
      const key = receiptKey(workspaceId, commandKind, idempotencyKey);
      const existing = receipts.get(key);
      if (!existing || existing.leaseOwner !== leaseOwner) {
        return false;
      }
      receipts.set(key, { ...existing, resultId: nextResultId });
      return true;
    },
    async completeCommandReceipt(workspaceId, commandKind, idempotencyKey, leaseOwner, resultJson) {
      const key = receiptKey(workspaceId, commandKind, idempotencyKey);
      const existing = receipts.get(key);
      if (!existing || existing.leaseOwner !== leaseOwner) {
        return false;
      }
      receipts.set(key, { ...existing, resultJson: structuredClone(resultJson) });
      return true;
    },
    async insertChannelWithOwner(channel, owner, createdEvent) {
      return withChannelLock(channel.id, () => {
        if (channel.nextSequence !== 1) {
          throw new Error("channel create must seed nextSequence=1 after sequence 0 create event");
        }
        channels.set(channel.id, structuredClone({ ...channel, nextSequence: 0 }));
        writeParticipant(owner);
        return appendEventLocked({
          channelId: channel.id,
          event: createdEvent,
        });
      });
    },
    async appendChannelEvent(input) {
      return withChannelLock(input.channelId, () => appendEventLocked(input));
    },
    async appendMessage(input) {
      return withChannelLock(input.channelId, () =>
        appendEventLocked({
          channelId: input.channelId,
          event: input.event,
          message: input.message,
        }),
      );
    },
    async createPinWithEvent(input) {
      return withChannelLock(input.channelId, () => {
        if (input.pin.channelId !== input.channelId) {
          throw new Error("pin channel mismatch");
        }
        const sourceCount =
          Number(input.pin.sourceEventId !== null) + Number(input.pin.sourceArtifactId !== null);
        if (sourceCount !== 1) {
          throw new Error("pin must reference exactly one source");
        }
        const duplicate = [...pins.values()].find((row) => {
          if (row.channelId !== input.channelId || row.removedAt !== null) {
            return false;
          }
          if (input.pin.sourceEventId) {
            return row.sourceEventId === input.pin.sourceEventId;
          }
          return row.sourceArtifactId === input.pin.sourceArtifactId;
        });
        if (duplicate) {
          throw new Error("pin_source_conflict");
        }
        const appended = appendEventLocked({
          channelId: input.channelId,
          event: input.event,
        });
        pins.set(input.pin.id, structuredClone(input.pin));
        return { ...appended, pin: structuredClone(input.pin) };
      });
    },
    async removePinWithEvent(input) {
      return withChannelLock(input.channelId, () => {
        const existing = pins.get(input.pinId);
        if (!existing || existing.channelId !== input.channelId) {
          throw new Error("pin_not_found");
        }
        if (existing.removedAt !== null) {
          throw new Error("pin_already_removed");
        }
        const appended = appendEventLocked({
          channelId: input.channelId,
          event: input.event,
        });
        const removed = { ...existing, removedAt: input.removedAt };
        pins.set(removed.id, removed);
        return { ...appended, pin: structuredClone(removed) };
      });
    },
    async insertCoworkerDraft(draft) {
      coworkerDrafts.set(draft.id, structuredClone(draft));
    },
    async getCoworkerDraft(id) {
      const draft = coworkerDrafts.get(id);
      return draft ? structuredClone(draft) : null;
    },
    async listCoworkerDrafts(workspaceId) {
      return [...coworkerDrafts.values()]
        .filter((row) => row.workspaceId === workspaceId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async supersedeCoworkerDrafts(input) {
      for (const draft of coworkerDrafts.values()) {
        if (
          draft.workspaceId === input.workspaceId &&
          draft.id !== input.exceptDraftId &&
          (draft.state === "draft" || draft.state === "awaiting_review")
        ) {
          coworkerDrafts.set(draft.id, {
            ...draft,
            state: "superseded",
            decidedAt: input.supersededBefore,
          });
        }
      }
    },
    async updateCoworkerDraftState(input) {
      const draft = coworkerDrafts.get(input.draftId);
      if (!draft || draft.revision !== input.expectedRevision) {
        return null;
      }
      const updated: CoworkerDraftRecord = {
        ...draft,
        state: input.nextState,
        decidedAt: input.decidedAt ?? draft.decidedAt,
        confirmIdempotencyKey: input.confirmIdempotencyKey ?? draft.confirmIdempotencyKey,
        provisionedCoworkerId: input.provisionedCoworkerId ?? draft.provisionedCoworkerId,
      };
      coworkerDrafts.set(updated.id, structuredClone(updated));
      return structuredClone(updated);
    },
    async provisionCoworkerFromDraft(input) {
      const run = async (): Promise<CoworkerDraftWriteResult> => {
        const draft = coworkerDrafts.get(input.draftId);
        if (!draft) {
          return { ok: false, reason: "not_found" };
        }

        if (new Date(input.now).getTime() > new Date(draft.expiresAt).getTime()) {
          if (draft.state === "awaiting_review") {
            coworkerDrafts.set(draft.id, { ...draft, state: "expired", decidedAt: input.now });
          }
          return { ok: false, reason: "expired", draft: structuredClone(draft) };
        }

        if (draft.confirmIdempotencyKey === input.idempotencyKey && draft.provisionedCoworkerId) {
          const existing = coworkers.get(draft.provisionedCoworkerId);
          if (existing) {
            return {
              ok: true,
              draft: structuredClone(draft),
              coworker: structuredClone(existing),
            };
          }
        }

        if (draft.state !== "awaiting_review") {
          if (
            draft.provisionedCoworkerId &&
            (draft.state === "confirmed" ||
              draft.state === "provisioning" ||
              draft.state === "ready")
          ) {
            const existing = coworkers.get(draft.provisionedCoworkerId);
            if (existing) {
              return {
                ok: true,
                draft: structuredClone(draft),
                coworker: structuredClone(existing),
              };
            }
          }
          return { ok: false, reason: "invalid_state", draft: structuredClone(draft) };
        }

        if (
          draft.revision !== input.expectedRevision ||
          draft.draftHash !== input.expectedHash ||
          draft.policyRevision !== input.expectedPolicyRevision ||
          draft.catalogRevision !== input.expectedCatalogRevision
        ) {
          return { ok: false, reason: "stale", draft: structuredClone(draft) };
        }

        const handleTaken = [...coworkers.values()].some(
          (row) =>
            row.workspaceId === draft.workspaceId &&
            row.handle.toLowerCase() === draft.proposal.handle.toLowerCase(),
        );
        if (handleTaken) {
          return { ok: false, reason: "handle_conflict", draft: structuredClone(draft) };
        }

        const config: CoworkerEditableConfig = {
          standing_instructions: draft.proposal.standing_instructions,
          model_preset: draft.proposal.model_preset,
          budget: draft.proposal.budget,
          channel_ids: [...draft.proposal.channel_ids],
          task_record_grants: draft.proposal.task_record_grants.map((grant) => ({
            channel_id: grant.channel_id,
            operations: [...grant.operations],
          })),
          tool_grants: [...draft.proposal.tool_grants],
          skill_version_ids: [...draft.proposal.skill_version_ids],
          component_version_ids: [...draft.proposal.component_version_ids],
          sandbox: draft.effectivePreview.sandbox,
        };
        const versionConfig = {
          ...config,
          name: draft.proposal.name,
          handle: draft.proposal.handle,
          title: draft.proposal.title,
          native_subagents_enabled: false,
        };
        const version: AgentVersionRecord = {
          id: input.versionId,
          agentProfileId: input.coworkerId,
          version: 1,
          configJson: versionConfig,
          specHash: input.specHash,
          createdBy: input.actorId,
          createdAt: input.createdAt,
        };
        const coworker: CoworkerRecord = {
          id: input.coworkerId,
          workspaceId: draft.workspaceId,
          handle: draft.proposal.handle,
          name: draft.proposal.name,
          title: draft.proposal.title,
          avatarSeed: null,
          visibility: "workspace",
          status: "active",
          editableConfigJson: config,
          currentVersionId: input.versionId,
          configRevision: 1,
          nativeSubagentsEnabled: false,
          createdAt: input.createdAt,
          updatedAt: input.createdAt,
        };

        coworkers.set(coworker.id, structuredClone(coworker));
        versions.set(version.id, structuredClone(version));

        for (const channelId of draft.proposal.channel_ids) {
          const key = `${channelId}:coworker:${coworker.id}`;
          participants.set(key, {
            channelId,
            participantType: "coworker",
            participantId: coworker.id,
            role: "member",
            joinedAt: input.createdAt,
            removedAt: null,
          });
        }

        const confirmed: CoworkerDraftRecord = {
          ...draft,
          state: "ready",
          decidedAt: input.now,
          confirmIdempotencyKey: input.idempotencyKey,
          provisionedCoworkerId: coworker.id,
        };
        coworkerDrafts.set(confirmed.id, structuredClone(confirmed));

        return {
          ok: true,
          draft: structuredClone(confirmed),
          coworker: structuredClone(coworker),
        };
      };

      const previous = draftProvisionLock;
      let release = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      draftProvisionLock = previous.then(() => gate);
      await previous;
      try {
        return await run();
      } finally {
        release();
      }
    },
  };
}

export type OwnerSession = SessionResponse;
