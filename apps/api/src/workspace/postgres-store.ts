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
  ChannelPatch,
  ChannelRecord,
  CommandReceipt,
  CoworkerEditableConfig,
  CoworkerMutationResult,
  CoworkerRecord,
  MembershipWriteResult,
  MessageRecord,
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

function mapMessage(row: typeof messages.$inferSelect): MessageRecord {
  return {
    id: row.id,
    channelId: row.channelId,
    eventId: row.eventId,
    authorType: row.authorType as MessageRecord["authorType"],
    authorId: row.authorId,
    body: row.body,
    parentMessageId: row.parentMessageId,
    createdAt: asIso(row.createdAt),
  };
}

async function upsertParticipantSql(tx: SqlClient, participant: ParticipantRecord): Promise<void> {
  await tx`
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
}

async function replaceGrantsSql(
  tx: SqlClient,
  rootSql: SqlClient,
  subjectId: string,
  grants: TaskGrantRecord[],
  revokedAt: string,
): Promise<void> {
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
        ${rootSql.json(grant.allowedOperationsJson)},
        ${rootSql.json(grant.allowedFieldsJson)},
        ${rootSql.json(grant.allowedTransitionsJson)},
        ${grant.policyRevision},
        ${grant.grantedBy},
        ${grant.createdAt},
        ${grant.revokedAt}
      )
    `;
  }
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
    async patchChannel(id, patch: ChannelPatch) {
      const set: Record<string, unknown> = { updatedAt: patch.updatedAt };
      if (patch.name !== undefined) {
        set.name = patch.name;
      }
      if (patch.missionBrief !== undefined) {
        set.missionBrief = patch.missionBrief;
      }
      if (patch.summary !== undefined) {
        set.summary = patch.summary;
      }
      if (patch.policyJson !== undefined) {
        set.policyJson = patch.policyJson;
      }
      if (patch.status !== undefined) {
        set.status = patch.status;
      }
      const rows = await db.update(channels).set(set).where(eq(channels.id, id)).returning();
      return rows[0] ? mapChannel(rows[0]) : null;
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
      await upsertParticipantSql(sql, participant);
    },
    async upsertParticipantMembership(input) {
      return sql.begin(async (tx) => {
        const channelRows = await tx<
          {
            id: string;
            workspace_id: string;
            name: string;
            mission_brief: string;
            summary: string | null;
            policy_json: unknown;
            next_sequence: number;
            status: string;
            created_by: string;
            created_at: string | Date;
            updated_at: string | Date;
          }[]
        >`
          SELECT *
          FROM channels
          WHERE id = ${input.channelOp.channelId}
          FOR UPDATE
        `;
        const channelRow = channelRows[0];
        if (!channelRow) {
          return { ok: false, reason: "not_found" } satisfies MembershipWriteResult;
        }
        if (channelRow.status === "archived") {
          return { ok: false, reason: "channel_archived" } satisfies MembershipWriteResult;
        }

        const coworkerRows = await tx<
          {
            id: string;
            workspace_id: string;
            handle: string;
            name: string;
            title: string;
            avatar_seed: string | null;
            visibility: string;
            status: string;
            editable_config_json: unknown;
            current_version_id: string | null;
            config_revision: number;
            created_at: string | Date;
            updated_at: string | Date;
          }[]
        >`
          SELECT *
          FROM agent_profiles
          WHERE id = ${input.coworkerId}
          FOR UPDATE
        `;
        const row = coworkerRows[0];
        if (!row) {
          return { ok: false, reason: "not_found" } satisfies MembershipWriteResult;
        }
        if (input.channelOp.type === "add" && row.status !== "active") {
          return { ok: false, reason: "coworker_inactive" } satisfies MembershipWriteResult;
        }

        await upsertParticipantSql(tx as unknown as SqlClient, input.participant);
        const config = asConfig(row.editable_config_json);
        const channelIds =
          input.channelOp.type === "add"
            ? [...new Set([...config.channel_ids, input.channelOp.channelId])]
            : config.channel_ids.filter((id) => id !== input.channelOp.channelId);
        const nextConfig = { ...config, channel_ids: channelIds };
        await tx.unsafe(
          `UPDATE agent_profiles
           SET editable_config_json = $1::jsonb,
               updated_at = $2
           WHERE id = $3`,
          [JSON.stringify(nextConfig), input.coworkerUpdatedAt, input.coworkerId],
        );
        return {
          ok: true,
          coworker: {
            id: row.id,
            workspaceId: row.workspace_id,
            handle: row.handle,
            name: row.name,
            title: row.title,
            avatarSeed: row.avatar_seed,
            visibility: "workspace" as const,
            status: row.status as CoworkerRecord["status"],
            editableConfigJson: nextConfig,
            currentVersionId: row.current_version_id,
            configRevision: row.config_revision,
            nativeSubagentsEnabled: false as const,
            createdAt: asIso(row.created_at),
            updatedAt: input.coworkerUpdatedAt,
          },
          channel: {
            id: channelRow.id,
            workspaceId: channelRow.workspace_id,
            name: channelRow.name,
            missionBrief: channelRow.mission_brief,
            summary: channelRow.summary,
            policyJson: (channelRow.policy_json ?? {}) as Record<string, unknown>,
            nextSequence: channelRow.next_sequence,
            status: channelRow.status as ChannelRecord["status"],
            createdBy: channelRow.created_by,
            createdAt: asIso(channelRow.created_at),
            updatedAt: asIso(channelRow.updated_at),
          },
        } satisfies MembershipWriteResult;
      });
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
    async commitCoworkerUpdate(input) {
      return sql.begin(async (tx) => {
        const locked = await tx<{ config_revision: number; status: string }[]>`
          SELECT config_revision, status
          FROM agent_profiles
          WHERE id = ${input.coworker.id}
          FOR UPDATE
        `;
        const current = locked[0];
        if (!current) {
          return { ok: false, reason: "not_found" } satisfies CoworkerMutationResult;
        }
        if (
          current.config_revision !== input.expectedConfigRevision ||
          current.status !== input.expectedStatus
        ) {
          return {
            ok: false,
            reason: "conflict",
            actualRevision: current.config_revision,
            actualStatus: current.status as CoworkerRecord["status"],
          } satisfies CoworkerMutationResult;
        }

        for (const membership of input.memberships) {
          await upsertParticipantSql(tx as unknown as SqlClient, membership);
        }
        await replaceGrantsSql(
          tx as unknown as SqlClient,
          sql,
          input.coworker.id,
          input.taskGrants,
          input.revokeGrantsAt,
        );
        await tx.unsafe(
          `INSERT INTO agent_versions (
             id, agent_profile_id, version, config_json, spec_hash, created_by, created_at
           )
           VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)`,
          [
            input.version.id,
            input.version.agentProfileId,
            input.version.version,
            JSON.stringify(input.version.configJson),
            input.version.specHash,
            input.version.createdBy,
            input.version.createdAt,
          ],
        );
        await tx.unsafe(
          `UPDATE agent_profiles
           SET handle = $1,
               name = $2,
               title = $3,
               status = $4,
               editable_config_json = $5::jsonb,
               current_version_id = $6,
               config_revision = $7,
               updated_at = $8
           WHERE id = $9`,
          [
            input.coworker.handle,
            input.coworker.name,
            input.coworker.title,
            input.coworker.status,
            JSON.stringify(input.coworker.editableConfigJson),
            input.coworker.currentVersionId,
            input.coworker.configRevision,
            input.coworker.updatedAt,
            input.coworker.id,
          ],
        );
        return { ok: true } satisfies CoworkerMutationResult;
      });
    },
    async disableCoworkerCleanup(input) {
      return sql.begin(async (tx) => {
        const locked = await tx<{ config_revision: number; status: string }[]>`
          SELECT config_revision, status
          FROM agent_profiles
          WHERE id = ${input.coworker.id}
          FOR UPDATE
        `;
        const current = locked[0];
        if (!current) {
          return { ok: false, reason: "not_found" } satisfies CoworkerMutationResult;
        }
        if (current.status === "disabled") {
          if (current.config_revision === input.coworker.configRevision) {
            return { ok: true } satisfies CoworkerMutationResult;
          }
          return {
            ok: false,
            reason: "conflict",
            actualRevision: current.config_revision,
            actualStatus: current.status as CoworkerRecord["status"],
          } satisfies CoworkerMutationResult;
        }
        if (current.config_revision !== input.expectedConfigRevision) {
          return {
            ok: false,
            reason: "conflict",
            actualRevision: current.config_revision,
            actualStatus: current.status as CoworkerRecord["status"],
          } satisfies CoworkerMutationResult;
        }

        for (const membership of input.memberships) {
          await upsertParticipantSql(tx as unknown as SqlClient, membership);
        }
        await replaceGrantsSql(
          tx as unknown as SqlClient,
          sql,
          input.coworker.id,
          [],
          input.revokeAt,
        );
        await tx.unsafe(
          `UPDATE agent_profiles
           SET handle = $1,
               name = $2,
               title = $3,
               status = $4,
               editable_config_json = $5::jsonb,
               current_version_id = $6,
               config_revision = $7,
               updated_at = $8
           WHERE id = $9`,
          [
            input.coworker.handle,
            input.coworker.name,
            input.coworker.title,
            input.coworker.status,
            JSON.stringify(input.coworker.editableConfigJson),
            input.coworker.currentVersionId,
            input.coworker.configRevision,
            input.coworker.updatedAt,
            input.coworker.id,
          ],
        );
        return { ok: true } satisfies CoworkerMutationResult;
      });
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
        await replaceGrantsSql(tx as unknown as SqlClient, sql, subjectId, grants, revokedAt);
      });
    },
    async getMessage(id) {
      const rows = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
      return rows[0] ? mapMessage(rows[0]) : null;
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
    async touchCommandReceipt(workspaceId, commandKind, idempotencyKey, touchedAt) {
      const updated = await sql`
        UPDATE workspace_command_receipts
        SET created_at = ${touchedAt}
        WHERE workspace_id = ${workspaceId}
          AND command_kind = ${commandKind}
          AND idempotency_key = ${idempotencyKey}
        RETURNING result_id
      `;
      return updated.length > 0;
    },
    async reclaimStaleCommandReceipt(workspaceId, commandKind, idempotencyKey, olderThanIso) {
      const deleted = await sql`
        DELETE FROM workspace_command_receipts
        WHERE workspace_id = ${workspaceId}
          AND command_kind = ${commandKind}
          AND idempotency_key = ${idempotencyKey}
          AND created_at < ${olderThanIso}
        RETURNING result_id
      `;
      return deleted.length > 0;
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
