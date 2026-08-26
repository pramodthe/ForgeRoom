import { createHash } from "node:crypto";
import type {
  AgentChannelEnvelope,
  Channel,
  ChannelArchiveCommand,
  ChannelCreateCommand,
  ChannelMessageCommand,
  ChannelUpdateCommand,
  CoworkerDisableCommand,
  CoworkerProfile,
  CoworkerUpdateCommand,
  SafeJsonObject,
  SessionResponse,
} from "@forgeroom/contracts";
import {
  channelSchema,
  coworkerProfileSchema,
  isReservedCoworkerHandle,
} from "@forgeroom/contracts";
import { resolveMessageRecipients, isChannelAgentSessionAvailable } from "@forgeroom/orchestration";
import { randomOpaqueId } from "../auth/crypto";
import { customAguiEvent, messageCreatedAguiEvent } from "./event-builders";
import { ChannelEventPersistenceError } from "./event-guard";
import { createChannelEventHub, type ChannelEventHub } from "./event-hub";
import { DEFAULT_EVENT_PAGE_SIZE, envelopeFromStoredEvent } from "./event-read";
import {
  createMemoryWorkspaceStore,
  emptyEditableConfig,
  type AgentVersionRecord,
  type ChannelEventInsert,
  type ChannelRecord,
  type CoworkerEditableConfig,
  type CoworkerRecord,
  type ParticipantRecord,
  type TaskGrantRecord,
  type WorkspaceCatalogStore,
} from "./store";

export type WorkspaceServiceError =
  | { code: "not_found"; message: string }
  | { code: "forbidden"; message: string; details?: SafeJsonObject }
  | { code: "validation_failed"; message: string; details?: SafeJsonObject }
  | { code: "conflict"; message: string; details?: SafeJsonObject }
  | { code: "recipient_required"; message: string; details?: SafeJsonObject }
  | { code: "recipient_unavailable"; message: string; details?: SafeJsonObject };

export type WorkspaceServiceResult<T> =
  { ok: true; value: T } | { ok: false; error: WorkspaceServiceError };

/** Stale in-progress idempotency claims older than this may be reclaimed after a crash. */
export const IDEMPOTENCY_CLAIM_LEASE_MS = 60_000;

function toChannel(row: ChannelRecord): Channel {
  return channelSchema.parse({
    schemaVersion: 1,
    id: row.id,
    workspace_id: row.workspaceId,
    name: row.name,
    mission_brief: row.missionBrief,
    status: row.status,
    next_sequence: row.nextSequence,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  });
}

function toCoworker(row: CoworkerRecord): CoworkerProfile {
  return coworkerProfileSchema.parse({
    schemaVersion: 1,
    id: row.id,
    workspace_id: row.workspaceId,
    handle: row.handle,
    name: row.name,
    title: row.title,
    status: row.status,
    native_subagents_enabled: false,
    current_version_id: row.currentVersionId,
    config_revision: row.configRevision,
  });
}

function configFromUpdate(command: CoworkerUpdateCommand): CoworkerEditableConfig {
  return {
    standing_instructions: command.standing_instructions,
    model_preset: command.model_preset,
    budget: command.budget,
    channel_ids: [...command.channel_ids],
    task_record_grants: command.task_record_grants.map((grant) => ({
      channel_id: grant.channel_id,
      operations: [...grant.operations],
    })),
    tool_grants: [...command.tool_grants],
    skill_version_ids: [...command.skill_version_ids],
    component_version_ids: [...command.component_version_ids],
  };
}

function specHash(config: Record<string, unknown>): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(config)).digest("hex")}`;
}

function assertWorkspace(
  session: SessionResponse,
  workspaceId: string,
): WorkspaceServiceError | null {
  if (session.workspace_id !== workspaceId) {
    return { code: "forbidden", message: "Workspace access denied." };
  }
  return null;
}

function isStaleClaim(createdAt: string, nowMs: number): boolean {
  const createdMs = Date.parse(createdAt);
  if (Number.isNaN(createdMs)) {
    return true;
  }
  return nowMs - createdMs >= IDEMPOTENCY_CLAIM_LEASE_MS;
}

function participantResultId(channelId: string, participantId: string): string {
  return `${channelId}:${participantId}`;
}

export type WorkspaceService = {
  createChannel(
    session: SessionResponse,
    workspaceId: string,
    command: ChannelCreateCommand,
  ): Promise<WorkspaceServiceResult<Channel>>;
  listChannels(
    session: SessionResponse,
    workspaceId: string,
  ): Promise<WorkspaceServiceResult<Channel[]>>;
  getChannel(session: SessionResponse, channelId: string): Promise<WorkspaceServiceResult<Channel>>;
  updateChannel(
    session: SessionResponse,
    channelId: string,
    command: ChannelUpdateCommand,
  ): Promise<WorkspaceServiceResult<Channel>>;
  archiveChannel(
    session: SessionResponse,
    channelId: string,
    command: ChannelArchiveCommand,
  ): Promise<WorkspaceServiceResult<Channel>>;
  addParticipant(
    session: SessionResponse,
    channelId: string,
    input: {
      participant_type: "coworker";
      participant_id: string;
      role: string;
      idempotency_key: string;
    },
  ): Promise<WorkspaceServiceResult<{ channel: Channel; participant_id: string }>>;
  removeParticipant(
    session: SessionResponse,
    channelId: string,
    participantId: string,
    idempotencyKey: string,
  ): Promise<WorkspaceServiceResult<{ channel: Channel; participant_id: string }>>;
  postMessage(
    session: SessionResponse,
    channelId: string,
    command: ChannelMessageCommand,
  ): Promise<
    WorkspaceServiceResult<{
      message_id: string;
      event_id: string;
      sequence: number;
      recipient_handles: string[];
      routing_mode: "direct" | "team";
    }>
  >;
  listEvents(
    session: SessionResponse,
    channelId: string,
    afterSequence: number,
    options?: { limit?: number },
  ): Promise<
    WorkspaceServiceResult<{
      events: AgentChannelEnvelope[];
      after_sequence: number;
      next_after_sequence: number;
      has_more: boolean;
    }>
  >;
  /**
   * Subscribe after durable commit fan-out. Caller owns SSE lifetime (no open DB txn).
   */
  subscribeChannelEvents(
    channelId: string,
    listener: (envelope: AgentChannelEnvelope) => void,
  ): () => void;
  listCoworkers(
    session: SessionResponse,
    workspaceId: string,
  ): Promise<WorkspaceServiceResult<CoworkerProfile[]>>;
  getCoworker(
    session: SessionResponse,
    coworkerId: string,
  ): Promise<WorkspaceServiceResult<CoworkerProfile & { config: CoworkerEditableConfig }>>;
  updateCoworker(
    session: SessionResponse,
    coworkerId: string,
    command: CoworkerUpdateCommand,
  ): Promise<
    WorkspaceServiceResult<{
      coworker: CoworkerProfile;
      config: CoworkerEditableConfig;
      session_rotations: string[];
      stale_proposal_ids: string[];
    }>
  >;
  disableCoworker(
    session: SessionResponse,
    coworkerId: string,
    command: CoworkerDisableCommand,
  ): Promise<WorkspaceServiceResult<CoworkerProfile>>;
  /** Test/fixture helper — not exposed as HTTP create. */
  seedCoworker(input: {
    workspaceId: string;
    createdBy: string;
    id?: string;
    handle: string;
    name: string;
    title: string;
    config?: Partial<CoworkerEditableConfig>;
    toolGrants?: string[];
  }): Promise<CoworkerRecord>;
};

export function createWorkspaceService(options?: {
  store?: WorkspaceCatalogStore;
  now?: () => Date;
  eventHub?: ChannelEventHub;
}): WorkspaceService {
  const store = options?.store ?? createMemoryWorkspaceStore();
  const now = options?.now ?? (() => new Date());
  const eventHub = options?.eventHub ?? createChannelEventHub();

  function publish(result: { envelope: AgentChannelEnvelope }): void {
    eventHub.publish(result.envelope);
  }

  function systemCustomEvent(
    _channelId: string,
    type: "channel.created" | "channel.renamed" | "channel.archived",
    actorId: string,
    createdAt: string,
  ): ChannelEventInsert {
    return {
      id: randomOpaqueId("evt"),
      type,
      actorType: "system",
      actorId,
      createdAt,
      draft: {
        actorKind: "system",
        aguiEvent: customAguiEvent(type),
      },
    };
  }

  function participantEvent(
    type: "participant.added" | "participant.removed",
    actorId: string,
    createdAt: string,
  ): ChannelEventInsert {
    return {
      id: randomOpaqueId("evt"),
      type,
      actorType: "system",
      actorId,
      createdAt,
      draft: {
        actorKind: "system",
        aguiEvent: customAguiEvent(type),
      },
    };
  }

  async function loadOwnedChannel(
    session: SessionResponse,
    channelId: string,
  ): Promise<WorkspaceServiceResult<ChannelRecord>> {
    const channel = await store.getChannel(channelId);
    if (!channel) {
      return { ok: false, error: { code: "not_found", message: "Channel not found." } };
    }
    const denied = assertWorkspace(session, channel.workspaceId);
    if (denied) {
      return { ok: false, error: denied };
    }
    return { ok: true, value: channel };
  }

  async function loadOwnedCoworker(
    session: SessionResponse,
    coworkerId: string,
  ): Promise<WorkspaceServiceResult<CoworkerRecord>> {
    const coworker = await store.getCoworker(coworkerId);
    if (!coworker) {
      return { ok: false, error: { code: "not_found", message: "Coworker not found." } };
    }
    const denied = assertWorkspace(session, coworker.workspaceId);
    if (denied) {
      return { ok: false, error: denied };
    }
    return { ok: true, value: coworker };
  }

  async function reloadIdempotentResult<T>(
    workspaceId: string,
    commandKind: string,
    idempotencyKey: string,
    reload: (resultId: string) => Promise<T | null>,
  ): Promise<WorkspaceServiceResult<T> | null> {
    const existing = await store.getCommandReceipt(workspaceId, commandKind, idempotencyKey);
    if (!existing) {
      return null;
    }
    if (existing.resultJson !== undefined && existing.resultJson !== null) {
      const cached = existing.resultJson as T;
      if (
        typeof cached === "object" &&
        cached !== null &&
        ("id" in cached ||
          "channel" in cached ||
          "coworker" in cached ||
          "participant_id" in cached)
      ) {
        return { ok: true, value: cached };
      }
    }
    const reloaded = await reload(existing.resultId);
    if (reloaded) {
      return { ok: true, value: reloaded };
    }
    return null;
  }

  async function withIdempotency<T>(input: {
    workspaceId: string;
    commandKind: string;
    idempotencyKey: string;
    resultId: string;
    reload: (resultId: string) => Promise<T | null>;
    /** Optional: reject when an existing claim is bound to a different target. */
    assertReceipt?: (receipt: { resultId: string }) => WorkspaceServiceError | null;
    run: () => Promise<WorkspaceServiceResult<T>>;
  }): Promise<WorkspaceServiceResult<T>> {
    const leaseOwner = randomOpaqueId("lease");
    const tryOnce = async (): Promise<{ claimed: boolean; result?: WorkspaceServiceResult<T> }> => {
      const claimed = await store.tryClaimCommandReceipt({
        workspaceId: input.workspaceId,
        commandKind: input.commandKind,
        idempotencyKey: input.idempotencyKey,
        resultId: input.resultId,
        leaseOwner,
        resultJson: null,
        createdAt: now().toISOString(),
      });
      if (claimed) {
        return { claimed: true };
      }
      const receipt = await store.getCommandReceipt(
        input.workspaceId,
        input.commandKind,
        input.idempotencyKey,
      );
      if (receipt && input.assertReceipt) {
        const mismatch = input.assertReceipt(receipt);
        if (mismatch) {
          return { claimed: false, result: { ok: false, error: mismatch } };
        }
      }
      const existing = await reloadIdempotentResult(
        input.workspaceId,
        input.commandKind,
        input.idempotencyKey,
        input.reload,
      );
      if (existing) {
        return { claimed: false, result: existing };
      }
      if (receipt && isStaleClaim(receipt.createdAt, now().getTime())) {
        const cutoff = new Date(now().getTime() - IDEMPOTENCY_CLAIM_LEASE_MS).toISOString();
        const reclaimed = await store.reclaimStaleCommandReceipt(
          input.workspaceId,
          input.commandKind,
          input.idempotencyKey,
          cutoff,
        );
        if (reclaimed) {
          return { claimed: false };
        }
      }
      return {
        claimed: false,
        result: {
          ok: false,
          error: { code: "conflict", message: "Idempotent command is already in progress." },
        },
      };
    };

    let claim = await tryOnce();
    if (!claim.claimed && !claim.result) {
      claim = await tryOnce();
    }
    if (!claim.claimed) {
      return (
        claim.result ?? {
          ok: false,
          error: { code: "conflict", message: "Idempotent command is already in progress." },
        }
      );
    }

    const heartbeat = setInterval(
      () => {
        void store.touchCommandReceipt(
          input.workspaceId,
          input.commandKind,
          input.idempotencyKey,
          leaseOwner,
          now().toISOString(),
        );
      },
      Math.max(1_000, Math.floor(IDEMPOTENCY_CLAIM_LEASE_MS / 3)),
    );
    if (typeof heartbeat.unref === "function") {
      heartbeat.unref();
    }

    try {
      const result = await input.run();
      if (!result.ok) {
        await store.deleteCommandReceipt(
          input.workspaceId,
          input.commandKind,
          input.idempotencyKey,
          leaseOwner,
        );
        return result;
      }
      return result;
    } catch (error) {
      await store.deleteCommandReceipt(
        input.workspaceId,
        input.commandKind,
        input.idempotencyKey,
        leaseOwner,
      );
      throw error;
    } finally {
      clearInterval(heartbeat);
    }
  }

  async function validateMembershipTargets(input: {
    workspaceId: string;
    coworkerId: string;
    channelIds: string[];
  }): Promise<
    { ok: true; memberships: ParticipantRecord[] } | { ok: false; error: WorkspaceServiceError }
  > {
    const uniqueIds = [...new Set(input.channelIds)];
    for (const channelId of uniqueIds) {
      const channel = await store.getChannel(channelId);
      if (!channel || channel.workspaceId !== input.workspaceId) {
        return {
          ok: false,
          error: {
            code: "validation_failed",
            message: "channel_ids must reference channels in the same workspace.",
            details: { channel_id: channelId },
          },
        };
      }
      if (channel.status === "archived") {
        return {
          ok: false,
          error: {
            code: "conflict",
            message: "Cannot add coworkers to an archived channel.",
            details: { channel_id: channelId, reason: "channel_archived" },
          },
        };
      }
    }

    const allChannels = await store.listChannels(input.workspaceId);
    const desired = new Set(uniqueIds);
    const joinedAt = now().toISOString();
    const memberships: ParticipantRecord[] = [];

    for (const channel of allChannels) {
      const existing = await store.getParticipant(channel.id, "coworker", input.coworkerId);
      const shouldBelong = desired.has(channel.id);
      if (shouldBelong) {
        memberships.push({
          channelId: channel.id,
          participantType: "coworker",
          participantId: input.coworkerId,
          role: "member",
          joinedAt: existing?.joinedAt ?? joinedAt,
          removedAt: null,
        });
      } else if (existing && existing.removedAt === null) {
        if (channel.status === "archived") {
          return {
            ok: false,
            error: {
              code: "conflict",
              message: "Cannot remove coworkers from an archived channel.",
              details: { channel_id: channel.id, reason: "channel_archived" },
            },
          };
        }
        memberships.push({
          ...existing,
          removedAt: joinedAt,
        });
      }
    }

    return { ok: true, memberships };
  }

  async function buildTaskGrants(input: {
    coworker: CoworkerRecord;
    grants: CoworkerEditableConfig["task_record_grants"];
    grantedBy: string;
  }): Promise<
    { ok: true; grants: TaskGrantRecord[] } | { ok: false; error: WorkspaceServiceError }
  > {
    const createdAt = now().toISOString();
    const next: TaskGrantRecord[] = [];
    for (const grant of input.grants) {
      const channel = await store.getChannel(grant.channel_id);
      if (!channel || channel.workspaceId !== input.coworker.workspaceId) {
        return {
          ok: false,
          error: {
            code: "validation_failed",
            message: "task_record_grants must reference workspace channels.",
            details: { channel_id: grant.channel_id },
          },
        };
      }
      next.push({
        id: randomOpaqueId("tgrant"),
        taskId: null,
        channelId: grant.channel_id,
        subjectType: "coworker",
        subjectId: input.coworker.id,
        allowedOperationsJson: [...grant.operations],
        allowedFieldsJson: [],
        allowedTransitionsJson: [],
        policyRevision: input.coworker.configRevision + 1,
        grantedBy: input.grantedBy,
        createdAt,
        revokedAt: null,
      });
    }
    return { ok: true, grants: next };
  }

  return {
    async createChannel(session, workspaceId, command) {
      const denied = assertWorkspace(session, workspaceId);
      if (denied) {
        return { ok: false, error: denied };
      }
      const channelId = randomOpaqueId("channel");
      return withIdempotency({
        workspaceId,
        commandKind: "channel.create",
        idempotencyKey: command.idempotency_key,
        resultId: channelId,
        reload: async (id) => {
          const row = await store.getChannel(id);
          return row ? toChannel(row) : null;
        },
        run: async () => {
          const createdAt = now().toISOString();
          const channel: ChannelRecord = {
            id: channelId,
            workspaceId,
            name: command.name,
            missionBrief: command.mission_brief,
            summary: null,
            policyJson: {},
            nextSequence: 1,
            status: "active",
            createdBy: session.user.id,
            createdAt,
            updatedAt: createdAt,
          };
          const created = await store.insertChannelWithOwner(
            channel,
            {
              channelId: channel.id,
              participantType: "human",
              participantId: session.user.id,
              role: "owner",
              joinedAt: createdAt,
              removedAt: null,
            },
            systemCustomEvent(channel.id, "channel.created", session.user.id, createdAt),
          );
          publish(created);
          return { ok: true, value: toChannel(created.channel) };
        },
      });
    },

    async listChannels(session, workspaceId) {
      const denied = assertWorkspace(session, workspaceId);
      if (denied) {
        return { ok: false, error: denied };
      }
      const rows = await store.listChannels(workspaceId);
      return { ok: true, value: rows.map(toChannel) };
    },

    async getChannel(session, channelId) {
      const loaded = await loadOwnedChannel(session, channelId);
      if (!loaded.ok) {
        return loaded;
      }
      return { ok: true, value: toChannel(loaded.value) };
    },

    async updateChannel(session, channelId, command) {
      const loaded = await loadOwnedChannel(session, channelId);
      if (!loaded.ok) {
        return loaded;
      }
      if (loaded.value.status === "archived") {
        return {
          ok: false,
          error: {
            code: "conflict",
            message: "Archived channels cannot be renamed.",
            details: { reason: "channel_archived" },
          },
        };
      }
      return withIdempotency({
        workspaceId: loaded.value.workspaceId,
        commandKind: "channel.update",
        idempotencyKey: command.idempotency_key,
        resultId: channelId,
        reload: async (id) => {
          const row = await store.getChannel(id);
          return row ? toChannel(row) : null;
        },
        run: async () => {
          const updatedAt = now().toISOString();
          try {
            const appended = await store.appendChannelEvent({
              channelId,
              event: systemCustomEvent(channelId, "channel.renamed", session.user.id, updatedAt),
              channelPatch: {
                name: command.name,
                missionBrief: command.mission_brief,
                updatedAt,
              },
            });
            publish(appended);
            return { ok: true, value: toChannel(appended.channel) };
          } catch (error) {
            if (error instanceof ChannelEventPersistenceError) {
              return {
                ok: false,
                error: {
                  code: "validation_failed",
                  message: error.message,
                },
              };
            }
            if (error instanceof Error && error.message.includes("not found")) {
              return { ok: false, error: { code: "not_found", message: "Channel not found." } };
            }
            if (error instanceof Error && error.message.includes("channel_archived")) {
              return {
                ok: false,
                error: {
                  code: "conflict",
                  message: "Archived channels cannot be renamed.",
                  details: { reason: "channel_archived" },
                },
              };
            }
            throw error;
          }
        },
      });
    },

    async archiveChannel(session, channelId, command) {
      const loaded = await loadOwnedChannel(session, channelId);
      if (!loaded.ok) {
        return loaded;
      }
      return withIdempotency({
        workspaceId: loaded.value.workspaceId,
        commandKind: "channel.archive",
        idempotencyKey: command.idempotency_key,
        resultId: channelId,
        reload: async (id) => {
          const row = await store.getChannel(id);
          return row ? toChannel(row) : null;
        },
        run: async () => {
          if (loaded.value.status === "archived") {
            return { ok: true, value: toChannel(loaded.value) };
          }
          const updatedAt = now().toISOString();
          try {
            const appended = await store.appendChannelEvent({
              channelId,
              event: systemCustomEvent(channelId, "channel.archived", session.user.id, updatedAt),
              channelPatch: {
                status: "archived",
                updatedAt,
              },
            });
            publish(appended);
            return { ok: true, value: toChannel(appended.channel) };
          } catch (error) {
            if (error instanceof Error && error.message.includes("not found")) {
              return { ok: false, error: { code: "not_found", message: "Channel not found." } };
            }
            if (error instanceof Error && error.message.includes("channel_archived")) {
              const latest = await store.getChannel(channelId);
              if (latest?.status === "archived") {
                return { ok: true, value: toChannel(latest) };
              }
              return {
                ok: false,
                error: {
                  code: "conflict",
                  message: "Channel was archived concurrently.",
                  details: { reason: "channel_archived" },
                },
              };
            }
            throw error;
          }
        },
      });
    },

    async addParticipant(session, channelId, input) {
      if (input.role === "coordinator") {
        return {
          ok: false,
          error: {
            code: "validation_failed",
            message: "Coordinator participant role is not accepted in P0.",
            details: { reason: "coordinator_unsupported" },
          },
        };
      }
      if (input.role !== "member") {
        return {
          ok: false,
          error: {
            code: "validation_failed",
            message: "Participant role must be member.",
            details: { role: input.role },
          },
        };
      }
      const loaded = await loadOwnedChannel(session, channelId);
      if (!loaded.ok) {
        return loaded;
      }
      if (loaded.value.status === "archived") {
        return {
          ok: false,
          error: {
            code: "conflict",
            message: "Archived channels cannot change participants.",
            details: { reason: "channel_archived" },
          },
        };
      }
      const coworker = await store.getCoworker(input.participant_id);
      if (!coworker || coworker.workspaceId !== loaded.value.workspaceId) {
        return {
          ok: false,
          error: {
            code: "validation_failed",
            message: "Coworker must belong to the channel workspace.",
            details: { participant_id: input.participant_id },
          },
        };
      }
      if (coworker.status !== "active") {
        return {
          ok: false,
          error: {
            code: "validation_failed",
            message: "Only active coworkers can join a channel.",
            details: { participant_id: input.participant_id },
          },
        };
      }
      return withIdempotency({
        workspaceId: loaded.value.workspaceId,
        commandKind: "channel.participant.add",
        idempotencyKey: input.idempotency_key,
        resultId: participantResultId(channelId, input.participant_id),
        assertReceipt: (receipt) => {
          const expected = participantResultId(channelId, input.participant_id);
          if (receipt.resultId !== expected) {
            return {
              code: "conflict",
              message: "Idempotency key was already used for a different participant.",
              details: {
                reason: "idempotency_key_reuse",
                expected_result_id: expected,
                claimed_result_id: receipt.resultId,
              },
            };
          }
          return null;
        },
        reload: async (resultId) => {
          if (resultId !== participantResultId(channelId, input.participant_id)) {
            return null;
          }
          const channel = await store.getChannel(channelId);
          return channel
            ? { channel: toChannel(channel), participant_id: input.participant_id }
            : null;
        },
        run: async (): Promise<
          WorkspaceServiceResult<{ channel: Channel; participant_id: string }>
        > => {
          const joinedAt = now().toISOString();
          const existing = await store.getParticipant(channelId, "coworker", input.participant_id);
          const written = await store.upsertParticipantMembership({
            participant: {
              channelId,
              participantType: "coworker",
              participantId: input.participant_id,
              role: "member",
              joinedAt: existing?.joinedAt ?? joinedAt,
              removedAt: null,
            },
            coworkerId: input.participant_id,
            coworkerUpdatedAt: joinedAt,
            channelOp: { type: "add", channelId },
            event: participantEvent("participant.added", session.user.id, joinedAt),
          });
          if (!written.ok) {
            if (written.reason === "channel_archived") {
              return {
                ok: false,
                error: {
                  code: "conflict",
                  message: "Archived channels cannot change participants.",
                  details: { reason: "channel_archived" },
                },
              };
            }
            if (written.reason === "coworker_inactive") {
              return {
                ok: false,
                error: {
                  code: "validation_failed",
                  message: "Only active coworkers can join a channel.",
                  details: { participant_id: input.participant_id },
                },
              };
            }
            return {
              ok: false,
              error: { code: "not_found", message: "Coworker or channel not found." },
            };
          }
          if (written.event) {
            publish(written.event);
          }
          return {
            ok: true,
            value: {
              channel: toChannel(written.channel),
              participant_id: input.participant_id,
            },
          };
        },
      });
    },

    async removeParticipant(session, channelId, participantId, idempotencyKey) {
      const loaded = await loadOwnedChannel(session, channelId);
      if (!loaded.ok) {
        return loaded;
      }
      if (loaded.value.status === "archived") {
        return {
          ok: false,
          error: {
            code: "conflict",
            message: "Archived channels cannot change participants.",
            details: { reason: "channel_archived" },
          },
        };
      }

      const expectedResultId = participantResultId(channelId, participantId);
      const existingReceipt = await store.getCommandReceipt(
        loaded.value.workspaceId,
        "channel.participant.remove",
        idempotencyKey,
      );
      if (existingReceipt && existingReceipt.resultId !== expectedResultId) {
        return {
          ok: false,
          error: {
            code: "conflict",
            message: "Idempotency key was already used for a different participant removal.",
            details: {
              reason: "idempotency_key_reuse",
              expected_result_id: expectedResultId,
              claimed_result_id: existingReceipt.resultId,
            },
          },
        };
      }

      const replay = await reloadIdempotentResult(
        loaded.value.workspaceId,
        "channel.participant.remove",
        idempotencyKey,
        async (resultId) => {
          if (resultId !== expectedResultId) {
            return null;
          }
          const channel = await store.getChannel(channelId);
          return channel ? { channel: toChannel(channel), participant_id: participantId } : null;
        },
      );
      if (replay) {
        return replay;
      }

      const existing = await store.getParticipant(channelId, "coworker", participantId);
      if (!existing || existing.removedAt) {
        return {
          ok: false,
          error: { code: "not_found", message: "Participant not found on channel." },
        };
      }
      return withIdempotency({
        workspaceId: loaded.value.workspaceId,
        commandKind: "channel.participant.remove",
        idempotencyKey,
        resultId: expectedResultId,
        assertReceipt: (receipt) => {
          if (receipt.resultId !== expectedResultId) {
            return {
              code: "conflict",
              message: "Idempotency key was already used for a different participant removal.",
              details: {
                reason: "idempotency_key_reuse",
                expected_result_id: expectedResultId,
                claimed_result_id: receipt.resultId,
              },
            };
          }
          return null;
        },
        reload: async (resultId) => {
          if (resultId !== expectedResultId) {
            return null;
          }
          const channel = await store.getChannel(channelId);
          return channel ? { channel: toChannel(channel), participant_id: participantId } : null;
        },
        run: async () => {
          const removedAt = now().toISOString();
          const coworker = await store.getCoworker(participantId);
          if (coworker && coworker.workspaceId === loaded.value.workspaceId) {
            const written = await store.upsertParticipantMembership({
              participant: { ...existing, removedAt },
              coworkerId: participantId,
              coworkerUpdatedAt: removedAt,
              channelOp: { type: "remove", channelId },
              event: participantEvent("participant.removed", session.user.id, removedAt),
            });
            if (!written.ok) {
              if (written.reason === "channel_archived") {
                return {
                  ok: false,
                  error: {
                    code: "conflict",
                    message: "Archived channels cannot change participants.",
                    details: { reason: "channel_archived" },
                  },
                };
              }
              return { ok: false, error: { code: "not_found", message: "Coworker not found." } };
            }
            if (written.event) {
              publish(written.event);
            }
            return {
              ok: true,
              value: {
                channel: toChannel(written.channel),
                participant_id: participantId,
              },
            };
          }
          const appended = await store.appendChannelEvent({
            channelId,
            event: participantEvent("participant.removed", session.user.id, removedAt),
            participantUpsert: { ...existing, removedAt },
          });
          publish(appended);
          return {
            ok: true,
            value: {
              channel: toChannel(appended.channel),
              participant_id: participantId,
            },
          };
        },
      });
    },

    async postMessage(session, channelId, command) {
      const loaded = await loadOwnedChannel(session, channelId);
      if (!loaded.ok) {
        return loaded;
      }
      if (loaded.value.status === "archived") {
        return {
          ok: false,
          error: {
            code: "conflict",
            message: "Archived channels cannot accept new messages.",
            details: { reason: "channel_archived" },
          },
        };
      }
      if (command.parent_message_id) {
        const parent = await store.getMessage(command.parent_message_id);
        if (!parent || parent.channelId !== channelId) {
          return {
            ok: false,
            error: {
              code: "validation_failed",
              message: "parent_message_id must reference a message in the same channel.",
              details: { parent_message_id: command.parent_message_id },
            },
          };
        }
      }
      const participants = await store.listParticipants(channelId);
      const activeMemberIds = new Set(
        participants
          .filter((row) => row.participantType === "coworker" && row.removedAt === null)
          .map((row) => row.participantId),
      );
      const coworkers = await store.listCoworkers(loaded.value.workspaceId);
      const sessions = await store.listChannelAgentSessions(channelId);
      const sessionStateByCoworker = new Map(
        sessions.map((row) => [row.agentProfileId, row.state] as const),
      );
      // Authoritative recipients come from body mentions / @team rules — never trust client arrays.
      // Availability is derived from channel_agent_sessions when present (rotating/disabled fail closed);
      // missing sessions (pre-P0-201) default available.
      const routing = resolveMessageRecipients({
        body: command.body,
        coworkers: coworkers.map((row) => ({
          id: row.id,
          handle: row.handle,
          status: row.status,
          isChannelMember: activeMemberIds.has(row.id),
          availableForNewWork: isChannelAgentSessionAvailable(sessionStateByCoworker.get(row.id)),
        })),
      });
      if (!routing.ok) {
        return {
          ok: false,
          error: {
            code: routing.code,
            message: routing.message,
            details: { reason: routing.reason, ...routing.details },
          },
        };
      }
      const createdAt = now().toISOString();
      const eventId = randomOpaqueId("evt");
      const messageId = randomOpaqueId("msg");
      try {
        const appended = await store.appendMessage({
          channelId,
          event: {
            id: eventId,
            type: "message.created",
            actorType: "human",
            actorId: session.user.id,
            runId: null,
            createdAt,
            draft: {
              actorKind: "human",
              sourceMessageId: messageId,
              aguiEvent: messageCreatedAguiEvent({
                routing_mode: routing.routing_mode,
                recipient_handles: routing.recipient_handles,
              }),
            },
          },
          message: {
            id: messageId,
            channelId,
            eventId,
            authorType: "human",
            authorId: session.user.id,
            body: command.body,
            parentMessageId: command.parent_message_id,
            createdAt,
          },
        });
        publish(appended);
        return {
          ok: true,
          value: {
            message_id: messageId,
            event_id: eventId,
            sequence: appended.sequence,
            recipient_handles: routing.recipient_handles,
            routing_mode: routing.routing_mode,
          },
        };
      } catch (error) {
        if (error instanceof ChannelEventPersistenceError) {
          return {
            ok: false,
            error: {
              code: "validation_failed",
              message: error.message,
            },
          };
        }
        if (error instanceof Error && error.message.includes("channel_archived")) {
          return {
            ok: false,
            error: {
              code: "conflict",
              message: "Archived channels cannot accept new messages.",
              details: { reason: "channel_archived" },
            },
          };
        }
        throw error;
      }
    },

    async listEvents(session, channelId, afterSequence, options) {
      const loaded = await loadOwnedChannel(session, channelId);
      if (!loaded.ok) {
        return loaded;
      }
      if (!Number.isInteger(afterSequence) || afterSequence < -1) {
        return {
          ok: false,
          error: {
            code: "validation_failed",
            message: "afterSequence must be an integer >= -1.",
          },
        };
      }
      const page = await store.listEventsAfter(channelId, afterSequence, {
        limit: options?.limit ?? DEFAULT_EVENT_PAGE_SIZE,
      });
      const events: AgentChannelEnvelope[] = [];
      for (const row of page.events) {
        const envelope = envelopeFromStoredEvent(row, {
          sourceMessageId: row.sourceMessageId,
        });
        if (envelope) {
          events.push(envelope);
        }
      }
      const lastSequence =
        page.events.length > 0 ? page.events[page.events.length - 1]!.sequence : afterSequence;
      return {
        ok: true,
        value: {
          events,
          after_sequence: afterSequence,
          next_after_sequence: lastSequence,
          has_more: page.hasMore,
        },
      };
    },

    subscribeChannelEvents(channelId, listener) {
      return eventHub.subscribe(channelId, listener);
    },

    async listCoworkers(session, workspaceId) {
      const denied = assertWorkspace(session, workspaceId);
      if (denied) {
        return { ok: false, error: denied };
      }
      const rows = await store.listCoworkers(workspaceId);
      return { ok: true, value: rows.map(toCoworker) };
    },

    async getCoworker(session, coworkerId) {
      const loaded = await loadOwnedCoworker(session, coworkerId);
      if (!loaded.ok) {
        return loaded;
      }
      return {
        ok: true,
        value: { ...toCoworker(loaded.value), config: loaded.value.editableConfigJson },
      };
    },

    async updateCoworker(session, coworkerId, command) {
      if (command.native_subagents_enabled !== false) {
        return {
          ok: false,
          error: {
            code: "validation_failed",
            message: "native_subagents_enabled must remain false in P0.",
          },
        };
      }
      const loaded = await loadOwnedCoworker(session, coworkerId);
      if (!loaded.ok) {
        return loaded;
      }
      if (loaded.value.status === "disabled") {
        return {
          ok: false,
          error: { code: "conflict", message: "Disabled coworkers cannot be edited." },
        };
      }
      const handleConflict = (await store.listCoworkers(loaded.value.workspaceId)).find(
        (row) => row.handle === command.handle && row.id !== coworkerId,
      );
      if (handleConflict) {
        return {
          ok: false,
          error: {
            code: "conflict",
            message: "Coworker handle already in use.",
            details: { handle: command.handle },
          },
        };
      }

      const grantPlan = await buildTaskGrants({
        coworker: loaded.value,
        grants: command.task_record_grants,
        grantedBy: session.user.id,
      });
      if (!grantPlan.ok) {
        return grantPlan;
      }
      const membershipPlan = await validateMembershipTargets({
        workspaceId: loaded.value.workspaceId,
        coworkerId,
        channelIds: command.channel_ids,
      });
      if (!membershipPlan.ok) {
        return membershipPlan;
      }

      const updatedAt = now().toISOString();
      const membershipEvents: Array<{ channelId: string; event: ChannelEventInsert }> = [];
      for (const membership of membershipPlan.memberships) {
        const prior = await store.getParticipant(membership.channelId, "coworker", coworkerId);
        if (membership.removedAt === null && (!prior || prior.removedAt !== null)) {
          membershipEvents.push({
            channelId: membership.channelId,
            event: participantEvent("participant.added", session.user.id, updatedAt),
          });
        } else if (membership.removedAt !== null && prior && prior.removedAt === null) {
          membershipEvents.push({
            channelId: membership.channelId,
            event: participantEvent("participant.removed", session.user.id, updatedAt),
          });
        }
      }

      const config = configFromUpdate(command);
      const nextRevision = loaded.value.configRevision + 1;
      const versionId = randomOpaqueId("av");
      const versionConfig = {
        ...config,
        name: command.name,
        handle: command.handle,
        title: command.title,
        native_subagents_enabled: false,
      };
      const version: AgentVersionRecord = {
        id: versionId,
        agentProfileId: coworkerId,
        version: nextRevision,
        configJson: versionConfig,
        specHash: specHash(versionConfig),
        createdBy: session.user.id,
        createdAt: updatedAt,
      };
      const updated: CoworkerRecord = {
        ...loaded.value,
        handle: command.handle,
        name: command.name,
        title: command.title,
        editableConfigJson: config,
        currentVersionId: versionId,
        configRevision: nextRevision,
        updatedAt,
      };
      const committed = await store.commitCoworkerUpdate({
        coworker: updated,
        version,
        memberships: membershipPlan.memberships,
        membershipEvents,
        taskGrants: grantPlan.grants,
        revokeGrantsAt: updatedAt,
        expectedConfigRevision: loaded.value.configRevision,
        expectedStatus: "active",
      });
      if (!committed.ok) {
        if (committed.reason === "channel_archived") {
          return {
            ok: false,
            error: {
              code: "conflict",
              message: "Archived channels cannot change participants.",
              details: { channel_id: committed.channelId, reason: "channel_archived" },
            },
          };
        }
        if (committed.reason === "not_found") {
          return { ok: false, error: { code: "not_found", message: "Coworker not found." } };
        }
        return {
          ok: false,
          error: {
            code: "conflict",
            message: "Coworker changed concurrently; refresh and retry.",
            details: {
              reason: "coworker_concurrent_modification",
              ...(committed.actualRevision !== undefined
                ? { actual_config_revision: committed.actualRevision }
                : {}),
              ...(committed.actualStatus !== undefined
                ? { actual_status: committed.actualStatus }
                : {}),
            },
          },
        };
      }
      for (const appended of committed.events ?? []) {
        publish(appended);
      }
      return {
        ok: true,
        value: {
          coworker: toCoworker(updated),
          config,
          session_rotations: [],
          stale_proposal_ids: [],
        },
      };
    },

    async disableCoworker(session, coworkerId, command) {
      const loaded = await loadOwnedCoworker(session, coworkerId);
      if (!loaded.ok) {
        return loaded;
      }

      const replay = await reloadIdempotentResult(
        loaded.value.workspaceId,
        "coworker.disable",
        command.idempotency_key,
        async (id) => {
          const row = await store.getCoworker(id);
          return row ? toCoworker(row) : null;
        },
      );
      if (replay) {
        return replay;
      }

      if (loaded.value.configRevision !== command.expected_config_revision) {
        return {
          ok: false,
          error: {
            code: "conflict",
            message: "Coworker config revision mismatch.",
            details: {
              expected_config_revision: command.expected_config_revision,
              actual_config_revision: loaded.value.configRevision,
            },
          },
        };
      }
      return withIdempotency({
        workspaceId: loaded.value.workspaceId,
        commandKind: "coworker.disable",
        idempotencyKey: command.idempotency_key,
        resultId: coworkerId,
        reload: async (id) => {
          const row = await store.getCoworker(id);
          return row ? toCoworker(row) : null;
        },
        run: async () => {
          if (loaded.value.status === "disabled") {
            return { ok: true, value: toCoworker(loaded.value) };
          }
          const updatedAt = now().toISOString();
          const allChannels = await store.listChannels(loaded.value.workspaceId);
          const removalEvents: Array<{ channelId: string; event: ChannelEventInsert }> = [];
          for (const channel of allChannels) {
            const membership = await store.getParticipant(channel.id, "coworker", coworkerId);
            if (membership && membership.removedAt === null) {
              removalEvents.push({
                channelId: channel.id,
                event: participantEvent("participant.removed", session.user.id, updatedAt),
              });
            }
          }
          const updated: CoworkerRecord = {
            ...loaded.value,
            status: "disabled",
            editableConfigJson: {
              ...loaded.value.editableConfigJson,
              channel_ids: [],
              task_record_grants: [],
            },
            configRevision: loaded.value.configRevision + 1,
            updatedAt,
          };
          const disabled = await store.disableCoworkerCleanup({
            coworker: updated,
            revokeAt: updatedAt,
            expectedConfigRevision: loaded.value.configRevision,
            removalEvents,
          });
          if (!disabled.ok) {
            if (disabled.reason === "not_found") {
              return { ok: false, error: { code: "not_found", message: "Coworker not found." } };
            }
            return {
              ok: false,
              error: {
                code: "conflict",
                message: "Coworker changed concurrently; refresh and retry.",
                details: {
                  reason: "coworker_concurrent_modification",
                  ...(disabled.actualRevision !== undefined
                    ? { actual_config_revision: disabled.actualRevision }
                    : {}),
                  ...(disabled.actualStatus !== undefined
                    ? { actual_status: disabled.actualStatus }
                    : {}),
                },
              },
            };
          }
          for (const appended of disabled.events ?? []) {
            publish(appended);
          }
          return { ok: true, value: toCoworker(updated) };
        },
      });
    },

    async seedCoworker(input) {
      if (isReservedCoworkerHandle(input.handle)) {
        throw new Error(`Coworker handle "${input.handle}" is reserved for routing syntax.`);
      }
      const createdAt = now().toISOString();
      const id = input.id ?? randomOpaqueId("cw");
      const versionId = randomOpaqueId("av");
      const config: CoworkerEditableConfig = {
        ...emptyEditableConfig(),
        ...input.config,
        tool_grants: input.toolGrants ?? input.config?.tool_grants ?? [],
      };
      const versionConfig = {
        ...config,
        name: input.name,
        handle: input.handle,
        title: input.title,
        native_subagents_enabled: false,
      };
      const version: AgentVersionRecord = {
        id: versionId,
        agentProfileId: id,
        version: 1,
        configJson: versionConfig,
        specHash: specHash(versionConfig),
        createdBy: input.createdBy,
        createdAt,
      };
      const coworker: CoworkerRecord = {
        id,
        workspaceId: input.workspaceId,
        handle: input.handle,
        name: input.name,
        title: input.title,
        avatarSeed: null,
        visibility: "workspace",
        status: "active",
        editableConfigJson: config,
        currentVersionId: versionId,
        configRevision: 1,
        nativeSubagentsEnabled: false,
        createdAt,
        updatedAt: createdAt,
      };
      await store.insertCoworker(coworker, version);
      return coworker;
    },
  };
}
