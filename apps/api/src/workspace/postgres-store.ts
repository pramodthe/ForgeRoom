import {
  agentProfiles,
  agentVersions,
  channelEvents,
  channelParticipants,
  channels,
  createDb,
  createSql,
  messages,
  taskGrants,
  workspaceCommandReceipts,
} from "@forgeroom/db";
import { and, eq, isNull } from "drizzle-orm";
import type {
  ChannelRecord,
  CommandReceipt,
  CoworkerEditableConfig,
  CoworkerRecord,
  ParticipantRecord,
  TaskGrantRecord,
  WorkspaceCatalogStore,
} from "./store";
import { createMemoryWorkspaceStore, emptyEditableConfig } from "./store";

type SqlClient = ReturnType<typeof createSql>;

function asIso(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toISOString();
}

function asConfig(value: unknown): CoworkerEditableConfig {
  if (!value || typeof value !== "object") {
    return emptyEditableConfig();
  }
  const raw = value as Partial<CoworkerEditableConfig>;
  return {
    ...emptyEditableConfig(),
    ...raw,
    budget: {
      max_turn_tokens: raw.budget?.max_turn_tokens ?? 12_000,
      max_tool_calls: raw.budget?.max_tool_calls ?? 20,
    },
    channel_ids: Array.isArray(raw.channel_ids) ? [...raw.channel_ids] : [],
    task_record_grants: Array.isArray(raw.task_record_grants)
      ? raw.task_record_grants.map((grant) => ({
          channel_id: grant.channel_id,
          operations: [...grant.operations],
        }))
      : [],
    tool_grants: Array.isArray(raw.tool_grants) ? [...raw.tool_grants] : [],
    skill_version_ids: Array.isArray(raw.skill_version_ids) ? [...raw.skill_version_ids] : [],
    component_version_ids: Array.isArray(raw.component_version_ids)
      ? [...raw.component_version_ids]
      : [],
  };
}

function mapChannel(row: typeof channels.$inferSelect): ChannelRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    missionBrief: row.missionBrief,
    summary: row.summary,
    policyJson: (row.policyJson ?? {}) as Record<string, unknown>,
    nextSequence: row.nextSequence,
    status: row.status as ChannelRecord["status"],
    createdBy: row.createdBy,
    createdAt: asIso(row.createdAt),
    updatedAt: asIso(row.updatedAt),
  };
}

function mapCoworker(row: typeof agentProfiles.$inferSelect): CoworkerRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    handle: row.handle,
    name: row.name,
    title: row.title,
    avatarSeed: row.avatarSeed,
    visibility: "workspace",
    status: row.status as CoworkerRecord["status"],
    editableConfigJson: asConfig(row.editableConfigJson),
    currentVersionId: row.currentVersionId,
    configRevision: row.configRevision,
    nativeSubagentsEnabled: false,
    createdAt: asIso(row.createdAt),
    updatedAt: asIso(row.updatedAt),
  };
}

function mapParticipant(row: typeof channelParticipants.$inferSelect): ParticipantRecord {
  return {
    channelId: row.channelId,
    participantType: row.participantType as ParticipantRecord["participantType"],
    participantId: row.participantId,
    role: row.role,
    joinedAt: asIso(row.joinedAt),
    removedAt: row.removedAt ? asIso(row.removedAt) : null,
  };
}

function mapGrant(row: typeof taskGrants.$inferSelect): TaskGrantRecord {
  return {
    id: row.id,
    taskId: row.taskId,
    channelId: row.channelId,
    subjectType: "coworker",
    subjectId: row.subjectId,
    allowedOperationsJson: Array.isArray(row.allowedOperationsJson)
      ? (row.allowedOperationsJson as string[])
      : [],
    allowedFieldsJson: Array.isArray(row.allowedFieldsJson)
      ? (row.allowedFieldsJson as string[])
      : [],
    allowedTransitionsJson: Array.isArray(row.allowedTransitionsJson)
      ? (row.allowedTransitionsJson as string[])
      : [],
    policyRevision: row.policyRevision,
    grantedBy: row.grantedBy,
    createdAt: asIso(row.createdAt),
    revokedAt: row.revokedAt ? asIso(row.revokedAt) : null,
  };
}

export function createPostgresWorkspaceStore(sql: SqlClient): WorkspaceCatalogStore {
  const db = createDb(sql);

  return {
    async getChannel(id) {
      const rows = await db.select().from(channels).where(eq(channels.id, id)).limit(1);
      return rows[0] ? mapChannel(rows[0]) : null;
    },
    async listChannels(workspaceId) {
      const rows = await db.select().from(channels).where(eq(channels.workspaceId, workspaceId));
      return rows.map(mapChannel).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async insertChannel(channel) {
      await db.insert(channels).values({
        id: channel.id,
        workspaceId: channel.workspaceId,
        name: channel.name,
        missionBrief: channel.missionBrief,
        summary: channel.summary,
        policyJson: channel.policyJson,
        nextSequence: channel.nextSequence,
        status: channel.status,
        createdBy: channel.createdBy,
        createdAt: channel.createdAt,
        updatedAt: channel.updatedAt,
      });
    },
    async updateChannel(channel) {
      await db
        .update(channels)
        .set({
          name: channel.name,
          missionBrief: channel.missionBrief,
          summary: channel.summary,
          policyJson: channel.policyJson,
          nextSequence: channel.nextSequence,
          status: channel.status,
          updatedAt: channel.updatedAt,
        })
        .where(eq(channels.id, channel.id));
    },
    async listParticipants(channelId) {
      const rows = await db
        .select()
        .from(channelParticipants)
        .where(eq(channelParticipants.channelId, channelId));
      return rows.map(mapParticipant);
    },
    async getParticipant(channelId, participantType, participantId) {
      const rows = await db
        .select()
        .from(channelParticipants)
        .where(
          and(
            eq(channelParticipants.channelId, channelId),
            eq(channelParticipants.participantType, participantType),
            eq(channelParticipants.participantId, participantId),
          ),
        )
        .limit(1);
      return rows[0] ? mapParticipant(rows[0]) : null;
    },
    async upsertParticipant(participant) {
      await sql`
        INSERT INTO channel_participants (
          channel_id, participant_type, participant_id, role, joined_at, removed_at
        )
        VALUES (
          ${participant.channelId},
          ${participant.participantType},
          ${participant.participantId},
          ${participant.role},
          ${participant.joinedAt},
          ${participant.removedAt}
        )
        ON CONFLICT (channel_id, participant_type, participant_id) DO UPDATE SET
          role = EXCLUDED.role,
          removed_at = EXCLUDED.removed_at
      `;
    },
    async getCoworker(id) {
      const rows = await db.select().from(agentProfiles).where(eq(agentProfiles.id, id)).limit(1);
      return rows[0] ? mapCoworker(rows[0]) : null;
    },
    async listCoworkers(workspaceId) {
      const rows = await db
        .select()
        .from(agentProfiles)
        .where(eq(agentProfiles.workspaceId, workspaceId));
      return rows.map(mapCoworker).sort((a, b) => a.handle.localeCompare(b.handle));
    },
    async insertCoworker(coworker, version) {
      await db.insert(agentProfiles).values({
        id: coworker.id,
        workspaceId: coworker.workspaceId,
        handle: coworker.handle,
        name: coworker.name,
        title: coworker.title,
        avatarSeed: coworker.avatarSeed,
        visibility: coworker.visibility,
        status: coworker.status,
        editableConfigJson: coworker.editableConfigJson,
        currentVersionId: null,
        configRevision: coworker.configRevision,
        nativeSubagentsEnabled: false,
        createdAt: coworker.createdAt,
        updatedAt: coworker.updatedAt,
      });
      await db.insert(agentVersions).values({
        id: version.id,
        agentProfileId: version.agentProfileId,
        version: version.version,
        configJson: version.configJson,
        specHash: version.specHash,
        createdBy: version.createdBy,
        createdAt: version.createdAt,
      });
      await db
        .update(agentProfiles)
        .set({ currentVersionId: version.id })
        .where(eq(agentProfiles.id, coworker.id));
    },
    async updateCoworker(coworker, version) {
      if (version) {
        await db.insert(agentVersions).values({
          id: version.id,
          agentProfileId: version.agentProfileId,
          version: version.version,
          configJson: version.configJson,
          specHash: version.specHash,
          createdBy: version.createdBy,
          createdAt: version.createdAt,
        });
      }
      await db
        .update(agentProfiles)
        .set({
          handle: coworker.handle,
          name: coworker.name,
          title: coworker.title,
          status: coworker.status,
          editableConfigJson: coworker.editableConfigJson,
          currentVersionId: coworker.currentVersionId,
          configRevision: coworker.configRevision,
          updatedAt: coworker.updatedAt,
        })
        .where(eq(agentProfiles.id, coworker.id));
    },
    async listActiveTaskGrantsForSubject(subjectId) {
      const rows = await db
        .select()
        .from(taskGrants)
        .where(and(eq(taskGrants.subjectId, subjectId), isNull(taskGrants.revokedAt)));
      return rows.map(mapGrant);
    },
    async replaceActiveTaskGrantsForSubject(subjectId, grants, revokedAt) {
      await sql.begin(async (tx) => {
        await tx`
          UPDATE task_grants
          SET revoked_at = ${revokedAt}
          WHERE subject_id = ${subjectId} AND revoked_at IS NULL
        `;
        for (const grant of grants) {
          await tx`
            INSERT INTO task_grants (
              id, task_id, channel_id, subject_type, subject_id,
              allowed_operations_json, allowed_fields_json, allowed_transitions_json,
              policy_revision, granted_by, created_at, revoked_at
            )
            VALUES (
              ${grant.id},
              ${grant.taskId},
              ${grant.channelId},
              ${grant.subjectType},
              ${grant.subjectId},
              ${sql.json(grant.allowedOperationsJson)},
              ${sql.json(grant.allowedFieldsJson)},
              ${sql.json(grant.allowedTransitionsJson)},
              ${grant.policyRevision},
              ${grant.grantedBy},
              ${grant.createdAt},
              ${grant.revokedAt}
            )
          `;
        }
      });
    },
    async getCommandReceipt(workspaceId, commandKind, idempotencyKey) {
      const rows = await db
        .select()
        .from(workspaceCommandReceipts)
        .where(
          and(
            eq(workspaceCommandReceipts.workspaceId, workspaceId),
            eq(workspaceCommandReceipts.commandKind, commandKind),
            eq(workspaceCommandReceipts.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      const row = rows[0];
      if (!row) {
        return null;
      }
      return {
        workspaceId: row.workspaceId,
        commandKind: row.commandKind,
        idempotencyKey: row.idempotencyKey,
        resultId: row.resultId,
        resultJson: null,
        createdAt: asIso(row.createdAt),
      } satisfies CommandReceipt;
    },
    async tryClaimCommandReceipt(receipt) {
      const inserted = await sql`
        INSERT INTO workspace_command_receipts (
          workspace_id, command_kind, idempotency_key, result_id, created_at
        )
        VALUES (
          ${receipt.workspaceId},
          ${receipt.commandKind},
          ${receipt.idempotencyKey},
          ${receipt.resultId},
          ${receipt.createdAt}
        )
        ON CONFLICT (workspace_id, command_kind, idempotency_key) DO NOTHING
        RETURNING result_id
      `;
      return inserted.length > 0;
    },
    async deleteCommandReceipt(workspaceId, commandKind, idempotencyKey) {
      await db
        .delete(workspaceCommandReceipts)
        .where(
          and(
            eq(workspaceCommandReceipts.workspaceId, workspaceId),
            eq(workspaceCommandReceipts.commandKind, commandKind),
            eq(workspaceCommandReceipts.idempotencyKey, idempotencyKey),
          ),
        );
    },
    async insertChannelWithOwner(channel, owner) {
      await db.transaction(async (tx) => {
        await tx.insert(channels).values({
          id: channel.id,
          workspaceId: channel.workspaceId,
          name: channel.name,
          missionBrief: channel.missionBrief,
          summary: channel.summary,
          policyJson: channel.policyJson,
          nextSequence: channel.nextSequence,
          status: channel.status,
          createdBy: channel.createdBy,
          createdAt: channel.createdAt,
          updatedAt: channel.updatedAt,
        });
        await tx.insert(channelParticipants).values({
          channelId: owner.channelId,
          participantType: owner.participantType,
          participantId: owner.participantId,
          role: owner.role,
          joinedAt: owner.joinedAt,
          removedAt: owner.removedAt,
        });
      });
    },
    async appendMessage(input) {
      return db.transaction(async (tx) => {
        const locked = await tx
          .select()
          .from(channels)
          .where(eq(channels.id, input.channelId))
          .for("update")
          .limit(1);
        const current = locked[0];
        if (!current || current.status !== "active") {
          throw new Error("channel_archived_or_missing");
        }
        const sequence = current.nextSequence;
        const updatedAt = input.event.createdAt;
        await tx
          .update(channels)
          .set({ nextSequence: sequence + 1, updatedAt })
          .where(eq(channels.id, input.channelId));
        await tx.insert(channelEvents).values({
          id: input.event.id,
          channelId: input.event.channelId,
          sequence,
          type: input.event.type,
          actorType: input.event.actorType,
          actorId: input.event.actorId,
          runId: input.event.runId,
          payloadJson: input.event.payloadJson,
          aguiEventType: null,
          aguiEventJson: null,
          logicalThreadId: null,
          createdAt: input.event.createdAt,
        });
        await tx.insert(messages).values({
          id: input.message.id,
          channelId: input.message.channelId,
          eventId: input.message.eventId,
          authorType: input.message.authorType,
          authorId: input.message.authorId,
          body: input.message.body,
          parentMessageId: input.message.parentMessageId,
          createdAt: input.message.createdAt,
        });
        return {
          sequence,
          channel: {
            ...mapChannel(current),
            nextSequence: sequence + 1,
            updatedAt,
          },
        };
      });
    },
  };
}

export function createDefaultWorkspaceStore(options: {
  authStore: "memory" | "postgres";
  sql?: SqlClient | null;
}): WorkspaceCatalogStore {
  if (options.authStore === "postgres") {
    if (!options.sql) {
      throw new Error("Postgres workspace store requires a SQL client");
    }
    return createPostgresWorkspaceStore(options.sql);
  }
  return createMemoryWorkspaceStore();
}
