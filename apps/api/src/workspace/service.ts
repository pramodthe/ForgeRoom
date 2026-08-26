import { createHash } from "node:crypto";
import type {
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
} from "@forgeroom/contracts";
import { randomOpaqueId } from "../auth/crypto";
import {
  createMemoryWorkspaceStore,
  emptyEditableConfig,
  type AgentVersionRecord,
  type ChannelRecord,
  type CoworkerEditableConfig,
  type CoworkerRecord,
  type TaskGrantRecord,
  type WorkspaceCatalogStore,
} from "./store";

export type WorkspaceServiceError =
  | { code: "not_found"; message: string }
  | { code: "forbidden"; message: string; details?: SafeJsonObject }
  | { code: "validation_failed"; message: string; details?: SafeJsonObject }
  | { code: "conflict"; message: string; details?: SafeJsonObject };

export type WorkspaceServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: WorkspaceServiceError };

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
  getChannel(
    session: SessionResponse,
    channelId: string,
  ): Promise<WorkspaceServiceResult<Channel>>;
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
    input: { participant_type: "coworker"; participant_id: string; role: string; idempotency_key: string },
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
  ): Promise<WorkspaceServiceResult<{ message_id: string; event_id: string; sequence: number }>>;
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
}): WorkspaceService {
  const store = options?.store ?? createMemoryWorkspaceStore();
  const now = options?.now ?? (() => new Date());

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
        ("id" in cached || "channel" in cached || "coworker" in cached || "participant_id" in cached)
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
    run: () => Promise<WorkspaceServiceResult<T>>;
  }): Promise<WorkspaceServiceResult<T>> {
    const claimed = await store.tryClaimCommandReceipt({
      workspaceId: input.workspaceId,
      commandKind: input.commandKind,
      idempotencyKey: input.idempotencyKey,
      resultId: input.resultId,
      resultJson: null,
      createdAt: now().toISOString(),
    });
    if (!claimed) {
      const existing = await reloadIdempotentResult(
        input.workspaceId,
        input.commandKind,
        input.idempotencyKey,
        input.reload,
      );
      if (existing) {
        return existing;
      }
      return {
        ok: false,
        error: { code: "conflict", message: "Idempotent command is already in progress." },
      };
    }
    try {
      const result = await input.run();
      if (!result.ok) {
        await store.deleteCommandReceipt(
          input.workspaceId,
          input.commandKind,
          input.idempotencyKey,
        );
        return result;
      }
      return result;
    } catch (error) {
      await store.deleteCommandReceipt(input.workspaceId, input.commandKind, input.idempotencyKey);
      throw error;
    }
  }

  async function syncChannelMembership(input: {
    workspaceId: string;
    coworkerId: string;
    channelIds: string[];
    actorId: string;
  }): Promise<WorkspaceServiceError | null> {
    const uniqueIds = [...new Set(input.channelIds)];
    for (const channelId of uniqueIds) {
      const channel = await store.getChannel(channelId);
      if (!channel || channel.workspaceId !== input.workspaceId) {
        return {
          code: "validation_failed",
          message: "channel_ids must reference channels in the same workspace.",
          details: { channel_id: channelId },
        };
      }
      if (channel.status === "archived") {
        return {
          code: "conflict",
          message: "Cannot add coworkers to an archived channel.",
          details: { channel_id: channelId, reason: "channel_archived" },
        };
      }
    }

    const allChannels = await store.listChannels(input.workspaceId);
    const desired = new Set(uniqueIds);
    const joinedAt = now().toISOString();
    for (const channel of allChannels) {
      const existing = await store.getParticipant(channel.id, "coworker", input.coworkerId);
      const shouldBelong = desired.has(channel.id);
      if (shouldBelong) {
        if (channel.status === "archived") {
          continue;
        }
        await store.upsertParticipant({
          channelId: channel.id,
          participantType: "coworker",
          participantId: input.coworkerId,
          role: "member",
          joinedAt: existing?.joinedAt ?? joinedAt,
          removedAt: null,
        });
      } else if (existing && existing.removedAt === null) {
        await store.upsertParticipant({
          ...existing,
          removedAt: joinedAt,
        });
      }
    }
    void input.actorId;
    return null;
  }

  async function replaceTaskGrants(input: {
    coworker: CoworkerRecord;
    grants: CoworkerEditableConfig["task_record_grants"];
    grantedBy: string;
  }): Promise<WorkspaceServiceError | null> {
    const createdAt = now().toISOString();
    const next: TaskGrantRecord[] = [];
    for (const grant of input.grants) {
      const channel = await store.getChannel(grant.channel_id);
      if (!channel || channel.workspaceId !== input.coworker.workspaceId) {
        return {
          code: "validation_failed",
          message: "task_record_grants must reference workspace channels.",
          details: { channel_id: grant.channel_id },
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
    await store.replaceActiveTaskGrantsForSubject(input.coworker.id, next, createdAt);
    return null;
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
            nextSequence: 0,
            status: "active",
            createdBy: session.user.id,
            createdAt,
            updatedAt: createdAt,
          };
          await store.insertChannelWithOwner(channel, {
            channelId: channel.id,
            participantType: "human",
            participantId: session.user.id,
            role: "owner",
            joinedAt: createdAt,
            removedAt: null,
          });
          return { ok: true, value: toChannel(channel) };
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
          const updated: ChannelRecord = {
            ...loaded.value,
            name: command.name ?? loaded.value.name,
            missionBrief: command.mission_brief ?? loaded.value.missionBrief,
            updatedAt: now().toISOString(),
          };
          await store.updateChannel(updated);
          return { ok: true, value: toChannel(updated) };
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
          const updated: ChannelRecord = {
            ...loaded.value,
            status: "archived",
            updatedAt: now().toISOString(),
          };
          await store.updateChannel(updated);
          return { ok: true, value: toChannel(updated) };
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
        resultId: `${channelId}:${input.participant_id}`,
        reload: async () => {
          const channel = await store.getChannel(channelId);
          return channel
            ? { channel: toChannel(channel), participant_id: input.participant_id }
            : null;
        },
        run: async () => {
          const joinedAt = now().toISOString();
          const existing = await store.getParticipant(channelId, "coworker", input.participant_id);
          await store.upsertParticipant({
            channelId,
            participantType: "coworker",
            participantId: input.participant_id,
            role: "member",
            joinedAt: existing?.joinedAt ?? joinedAt,
            removedAt: null,
          });
          const config = {
            ...coworker.editableConfigJson,
            channel_ids: [
              ...new Set([...coworker.editableConfigJson.channel_ids, channelId]),
            ],
          };
          await store.updateCoworker({
            ...coworker,
            editableConfigJson: config,
            updatedAt: joinedAt,
          });
          return {
            ok: true,
            value: { channel: toChannel(loaded.value), participant_id: input.participant_id },
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
        resultId: `${channelId}:${participantId}`,
        reload: async () => {
          const channel = await store.getChannel(channelId);
          return channel
            ? { channel: toChannel(channel), participant_id: participantId }
            : null;
        },
        run: async () => {
          const removedAt = now().toISOString();
          await store.upsertParticipant({ ...existing, removedAt });
          const coworker = await store.getCoworker(participantId);
          if (coworker && coworker.workspaceId === loaded.value.workspaceId) {
            await store.updateCoworker({
              ...coworker,
              editableConfigJson: {
                ...coworker.editableConfigJson,
                channel_ids: coworker.editableConfigJson.channel_ids.filter((id) => id !== channelId),
              },
              updatedAt: removedAt,
            });
          }
          return {
            ok: true,
            value: { channel: toChannel(loaded.value), participant_id: participantId },
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
      const participants = await store.listParticipants(channelId);
      const activeCoworkers = new Set(
        participants
          .filter((row) => row.participantType === "coworker" && row.removedAt === null)
          .map((row) => row.participantId),
      );
      for (const handle of command.recipient_handles) {
        const coworkers = await store.listCoworkers(loaded.value.workspaceId);
        const match = coworkers.find((row) => row.handle === handle && row.status === "active");
        if (!match || !activeCoworkers.has(match.id)) {
          return {
            ok: false,
            error: {
              code: "validation_failed",
              message: "Recipient must be an active channel coworker.",
              details: { handle },
            },
          };
        }
      }
      const createdAt = now().toISOString();
      const eventId = randomOpaqueId("evt");
      const messageId = randomOpaqueId("msg");
      try {
        const appended = await store.appendMessage({
          channelId,
          event: {
            id: eventId,
            channelId,
            type: "message.created",
            actorType: "human",
            actorId: session.user.id,
            runId: null,
            payloadJson: {
              body: command.body,
              recipient_handles: command.recipient_handles,
              routing_mode: command.routing_mode,
            },
            createdAt,
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
        return {
          ok: true,
          value: { message_id: messageId, event_id: eventId, sequence: appended.sequence },
        };
      } catch (error) {
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
      const membershipError = await syncChannelMembership({
        workspaceId: loaded.value.workspaceId,
        coworkerId,
        channelIds: command.channel_ids,
        actorId: session.user.id,
      });
      if (membershipError) {
        return { ok: false, error: membershipError };
      }
      const grantError = await replaceTaskGrants({
        coworker: loaded.value,
        grants: command.task_record_grants,
        grantedBy: session.user.id,
      });
      if (grantError) {
        return { ok: false, error: grantError };
      }

      const updatedAt = now().toISOString();
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
      await store.updateCoworker(updated, version);
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
          const updated: CoworkerRecord = {
            ...loaded.value,
            status: "disabled",
            configRevision: loaded.value.configRevision + 1,
            updatedAt,
          };
          await store.updateCoworker(updated);
          return { ok: true, value: toCoworker(updated) };
        },
      });
    },

    async seedCoworker(input) {
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
