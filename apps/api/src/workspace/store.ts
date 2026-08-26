import type { SessionResponse } from "@forgeroom/contracts";

export type ChannelStatus = "active" | "archived";
export type CoworkerStatus = "active" | "disabled";

export type CoworkerEditableConfig = {
  standing_instructions: string;
  model_preset: string;
  budget: { max_turn_tokens: number; max_tool_calls: number };
  channel_ids: string[];
  task_record_grants: Array<{ channel_id: string; operations: string[] }>;
  tool_grants: string[];
  skill_version_ids: string[];
  component_version_ids: string[];
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
  allowedTransitionsJson: string[];
  policyRevision: number;
  grantedBy: string;
  createdAt: string;
  revokedAt: string | null;
};

export type ChannelEventRecord = {
  id: string;
  channelId: string;
  sequence: number;
  type: string;
  actorType: "human" | "coworker" | "system";
  actorId: string;
  runId: string | null;
  payloadJson: Record<string, unknown>;
  createdAt: string;
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

export type CommandReceipt = {
  workspaceId: string;
  commandKind: string;
  idempotencyKey: string;
  resultId: string;
  resultJson: unknown;
  createdAt: string;
};

export type MembershipWriteResult =
  | { ok: true; coworker: CoworkerRecord; channel: ChannelRecord }
  | { ok: false; reason: "not_found" | "channel_archived" | "coworker_inactive" };

export type CoworkerMutationResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_found" | "conflict";
      actualRevision?: number;
      actualStatus?: CoworkerStatus;
    };

export type WorkspaceCatalogStore = {
  getChannel(id: string): Promise<ChannelRecord | null>;
  listChannels(workspaceId: string): Promise<ChannelRecord[]>;
  insertChannel(channel: ChannelRecord): Promise<void>;
  /** Updates metadata only — never overwrites nextSequence. */
  patchChannel(id: string, patch: ChannelPatch): Promise<ChannelRecord | null>;

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
   */
  upsertParticipantMembership(input: {
    participant: ParticipantRecord;
    coworkerId: string;
    coworkerUpdatedAt: string;
    channelOp: { type: "add"; channelId: string } | { type: "remove"; channelId: string };
  }): Promise<MembershipWriteResult>;

  getCoworker(id: string): Promise<CoworkerRecord | null>;
  listCoworkers(workspaceId: string): Promise<CoworkerRecord[]>;
  insertCoworker(coworker: CoworkerRecord, version: AgentVersionRecord): Promise<void>;
  updateCoworker(coworker: CoworkerRecord, version?: AgentVersionRecord): Promise<void>;
  /**
   * Atomically locks the profile, requires expected revision+active status,
   * then applies memberships/grants/profile/version.
   */
  commitCoworkerUpdate(input: {
    coworker: CoworkerRecord;
    version: AgentVersionRecord;
    memberships: ParticipantRecord[];
    taskGrants: TaskGrantRecord[];
    revokeGrantsAt: string;
    expectedConfigRevision: number;
    expectedStatus: "active";
  }): Promise<CoworkerMutationResult>;
  /**
   * Atomically locks the profile, requires expected revision, then disables and
   * clears membership/grants. Wins over concurrent stale edits.
   */
  disableCoworkerCleanup(input: {
    coworker: CoworkerRecord;
    memberships: ParticipantRecord[];
    revokeAt: string;
    expectedConfigRevision: number;
  }): Promise<CoworkerMutationResult>;

  listActiveTaskGrantsForSubject(subjectId: string): Promise<TaskGrantRecord[]>;
  replaceActiveTaskGrantsForSubject(
    subjectId: string,
    grants: TaskGrantRecord[],
    revokedAt: string,
  ): Promise<void>;

  getMessage(id: string): Promise<MessageRecord | null>;

  getCommandReceipt(
    workspaceId: string,
    commandKind: string,
    idempotencyKey: string,
  ): Promise<CommandReceipt | null>;
  /** Insert receipt; returns false if the idempotency key already exists. */
  tryClaimCommandReceipt(receipt: CommandReceipt): Promise<boolean>;
  /** Heartbeat: refresh created_at so the claim lease stays alive while work runs. */
  touchCommandReceipt(
    workspaceId: string,
    commandKind: string,
    idempotencyKey: string,
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
  deleteCommandReceipt(
    workspaceId: string,
    commandKind: string,
    idempotencyKey: string,
  ): Promise<void>;

  insertChannelWithOwner(channel: ChannelRecord, owner: ParticipantRecord): Promise<void>;

  appendMessage(input: {
    channelId: string;
    event: Omit<ChannelEventRecord, "sequence">;
    message: MessageRecord;
  }): Promise<{ sequence: number; channel: ChannelRecord }>;
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
  const events = new Map<string, ChannelEventRecord>();
  const messages = new Map<string, MessageRecord>();

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
      writeParticipant(input.participant);
      const updated: CoworkerRecord = {
        ...coworker,
        editableConfigJson: {
          ...coworker.editableConfigJson,
          channel_ids: mergeChannelIds(coworker.editableConfigJson.channel_ids, input.channelOp),
        },
        updatedAt: input.coworkerUpdatedAt,
      };
      coworkers.set(updated.id, structuredClone(updated));
      return {
        ok: true,
        coworker: structuredClone(updated),
        channel: structuredClone(channel),
      };
    },
    async getCoworker(id) {
      return coworkers.get(id) ?? null;
    },
    async listCoworkers(workspaceId) {
      return [...coworkers.values()]
        .filter((row) => row.workspaceId === workspaceId)
        .sort((a, b) => a.handle.localeCompare(b.handle));
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
      for (const membership of input.memberships) {
        writeParticipant(membership);
      }
      replaceGrants(input.coworker.id, input.taskGrants, input.revokeGrantsAt);
      coworkers.set(input.coworker.id, structuredClone(input.coworker));
      versions.set(input.version.id, structuredClone(input.version));
      return { ok: true };
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
      for (const membership of input.memberships) {
        writeParticipant(membership);
      }
      replaceGrants(input.coworker.id, [], input.revokeAt);
      coworkers.set(input.coworker.id, structuredClone(input.coworker));
      return { ok: true };
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
    async getCommandReceipt(workspaceId, commandKind, idempotencyKey) {
      return receipts.get(receiptKey(workspaceId, commandKind, idempotencyKey)) ?? null;
    },
    async tryClaimCommandReceipt(receipt) {
      const key = receiptKey(receipt.workspaceId, receipt.commandKind, receipt.idempotencyKey);
      if (receipts.has(key)) {
        return false;
      }
      receipts.set(key, structuredClone(receipt));
      return true;
    },
    async touchCommandReceipt(workspaceId, commandKind, idempotencyKey, touchedAt) {
      const key = receiptKey(workspaceId, commandKind, idempotencyKey);
      const existing = receipts.get(key);
      if (!existing) {
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
    async deleteCommandReceipt(workspaceId, commandKind, idempotencyKey) {
      receipts.delete(receiptKey(workspaceId, commandKind, idempotencyKey));
    },
    async insertChannelWithOwner(channel, owner) {
      channels.set(channel.id, structuredClone(channel));
      writeParticipant(owner);
    },
    async appendMessage(input) {
      const channel = channels.get(input.channelId);
      if (!channel) {
        throw new Error(`channel ${input.channelId} not found`);
      }
      if (channel.status === "archived") {
        throw new Error("channel_archived");
      }
      const sequence = channel.nextSequence;
      const updated: ChannelRecord = {
        ...channel,
        nextSequence: sequence + 1,
        updatedAt: input.event.createdAt,
      };
      const event = { ...input.event, sequence };
      channels.set(updated.id, structuredClone(updated));
      events.set(event.id, structuredClone(event));
      messages.set(input.message.id, structuredClone(input.message));
      return { sequence, channel: structuredClone(updated) };
    },
  };
}

export type OwnerSession = SessionResponse;
