import {
  agentProfiles,
  agentVersions,
  artifacts,
  channelAgentSessions,
  channelParticipants,
  channelPins,
  channels,
  createDb,
  createSql,
  messages,
  taskGrants,
  workspaceCommandReceipts,
} from "@forgeroom/db";
import { and, eq, isNull } from "drizzle-orm";
import { randomOpaqueId } from "../auth/crypto";
import { clampEventLimit } from "./event-read";
import { hashAguiEvent, materializeChannelEvent } from "./event-persist";
import type {
  AppendChannelEventResult,
  ChannelAgentSessionRecord,
  ChannelEventInsert,
  ChannelEventRecord,
  ChannelPatch,
  ChannelRecord,
  CommandReceipt,
  CoworkerEditableConfig,
  CoworkerMutationResult,
  CoworkerRecord,
  CoworkerUpdateResult,
  ListEventsAfterResult,
  MembershipWriteResult,
  MessageRecord,
  ParticipantRecord,
  PinRecord,
  SafeArtifactRecord,
  TaskGrantRecord,
  WorkspaceCatalogStore,
} from "./store";
import {
  createMemoryWorkspaceStore,
  decodeReceiptResultId,
  emptyEditableConfig,
  encodeReceiptResultId,
} from "./store";

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

function mapPin(row: typeof channelPins.$inferSelect): PinRecord {
  return {
    id: row.id,
    channelId: row.channelId,
    sourceEventId: row.sourceEventId,
    sourceArtifactId: row.sourceArtifactId,
    label: row.label,
    pinnedBy: row.pinnedBy,
    createdAt: asIso(row.createdAt),
    removedAt: row.removedAt ? asIso(row.removedAt) : null,
  };
}

function mapSafeArtifact(row: typeof artifacts.$inferSelect): SafeArtifactRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    channelId: row.channelId,
    runId: row.runId,
    runStepId: row.runStepId,
    creatorAgentId: row.creatorAgentId,
    kind: row.kind as SafeArtifactRecord["kind"],
    name: row.name,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    sha256: row.sha256,
    revision: row.revision,
    createdAt: asIso(row.createdAt),
  };
}

function mapAgentSession(row: typeof channelAgentSessions.$inferSelect): ChannelAgentSessionRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    channelId: row.channelId,
    agentProfileId: row.agentProfileId,
    logicalAguiThreadId: row.logicalAguiThreadId,
    currentGenerationId: row.currentGenerationId,
    lastDeliveredChannelSequence: row.lastDeliveredChannelSequence,
    state: row.state as ChannelAgentSessionRecord["state"],
    createdAt: asIso(row.createdAt),
    updatedAt: asIso(row.updatedAt),
  };
}

async function insertDurableEventSql(
  tx: SqlClient,
  channelId: string,
  sequence: number,
  insert: ChannelEventInsert,
): Promise<{ envelope: AppendChannelEventResult["envelope"]; event: ChannelEventRecord }> {
  const { envelope, event } = materializeChannelEvent(channelId, sequence, insert);
  await tx.unsafe(
    `INSERT INTO channel_events (
      id, channel_id, sequence, type, actor_type, actor_id, run_id,
      payload_json, agui_event_type, agui_event_json, logical_thread_id, created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8::jsonb, $9, $10::jsonb, $11, $12
    )`,
    [
      event.id,
      event.channelId,
      event.sequence,
      event.type,
      event.actorType,
      event.actorId,
      event.runId,
      JSON.stringify(event.payloadJson),
      event.aguiEventType,
      event.aguiEventJson ? JSON.stringify(event.aguiEventJson) : null,
      event.logicalThreadId,
      event.createdAt,
    ],
  );
  await tx.unsafe(
    `INSERT INTO agui_event_records (
      id, channel_event_id, agent_turn_id, logical_thread_id, agui_run_id,
      event_type, message_or_activity_id, storage_kind, event_json,
      schema_profile, event_hash, created_at
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9::jsonb,
      $10, $11, $12
    )`,
    [
      randomOpaqueId("agui"),
      event.id,
      envelope.agentTurnId ?? null,
      envelope.logicalThreadId ?? null,
      null,
      envelope.aguiEvent.type,
      envelope.sourceMessageId ?? null,
      "full_event",
      JSON.stringify(envelope.aguiEvent),
      "p0_persisted_agui",
      hashAguiEvent(envelope.aguiEvent),
      event.createdAt,
    ],
  );
  return { envelope, event };
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
        const nextRevision = row.config_revision + 1;
        await tx.unsafe(
          `UPDATE agent_profiles
           SET editable_config_json = $1::jsonb,
               config_revision = $2,
               updated_at = $3
           WHERE id = $4`,
          [JSON.stringify(nextConfig), nextRevision, input.coworkerUpdatedAt, input.coworkerId],
        );

        let appended: AppendChannelEventResult | undefined;
        let nextSequence = channelRow.next_sequence;
        let channelUpdatedAt = asIso(channelRow.updated_at);
        if (input.event) {
          const sequence = channelRow.next_sequence;
          const written = await insertDurableEventSql(
            tx as unknown as SqlClient,
            channelRow.id,
            sequence,
            input.event,
          );
          nextSequence = sequence + 1;
          channelUpdatedAt = input.event.createdAt;
          await tx`
            UPDATE channels
            SET next_sequence = ${nextSequence},
                updated_at = ${channelUpdatedAt}
            WHERE id = ${channelRow.id}
          `;
          appended = {
            sequence,
            channel: {
              id: channelRow.id,
              workspaceId: channelRow.workspace_id,
              name: channelRow.name,
              missionBrief: channelRow.mission_brief,
              summary: channelRow.summary,
              policyJson: (channelRow.policy_json ?? {}) as Record<string, unknown>,
              nextSequence,
              status: channelRow.status as ChannelRecord["status"],
              createdBy: channelRow.created_by,
              createdAt: asIso(channelRow.created_at),
              updatedAt: channelUpdatedAt,
            },
            envelope: written.envelope,
            event: written.event,
          };
        }

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
            configRevision: nextRevision,
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
            nextSequence,
            status: channelRow.status as ChannelRecord["status"],
            createdBy: channelRow.created_by,
            createdAt: asIso(channelRow.created_at),
            updatedAt: channelUpdatedAt,
          },
          ...(appended ? { event: appended } : {}),
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
        const affectedChannelIds = [
          ...new Set([
            ...input.memberships.map((membership) => membership.channelId),
            ...(input.membershipEvents ?? []).map((row) => row.channelId),
          ]),
        ].sort();
        for (const channelId of affectedChannelIds) {
          const channelRows = await tx<{ workspace_id: string; status: string }[]>`
            SELECT workspace_id, status
            FROM channels
            WHERE id = ${channelId}
            FOR UPDATE
          `;
          const channel = channelRows[0];
          if (!channel || channel.workspace_id !== input.coworker.workspaceId) {
            return { ok: false, reason: "conflict" } satisfies CoworkerUpdateResult;
          }
          if (channel.status === "archived") {
            return {
              ok: false,
              reason: "channel_archived",
              channelId,
            } satisfies CoworkerUpdateResult;
          }
        }

        const locked = await tx<{ config_revision: number; status: string }[]>`
          SELECT config_revision, status
          FROM agent_profiles
          WHERE id = ${input.coworker.id}
          FOR UPDATE
        `;
        const current = locked[0];
        if (!current) {
          return { ok: false, reason: "not_found" } satisfies CoworkerUpdateResult;
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
          } satisfies CoworkerUpdateResult;
        }

        const appended: AppendChannelEventResult[] = [];
        for (const membershipEvent of input.membershipEvents ?? []) {
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
            SELECT * FROM channels WHERE id = ${membershipEvent.channelId} FOR UPDATE
          `;
          const channelRow = channelRows[0];
          if (!channelRow) {
            return { ok: false, reason: "conflict" } satisfies CoworkerUpdateResult;
          }
          const sequence = channelRow.next_sequence;
          const written = await insertDurableEventSql(
            tx as unknown as SqlClient,
            membershipEvent.channelId,
            sequence,
            membershipEvent.event,
          );
          const nextSequence = sequence + 1;
          await tx`
            UPDATE channels
            SET next_sequence = ${nextSequence},
                updated_at = ${membershipEvent.event.createdAt}
            WHERE id = ${membershipEvent.channelId}
          `;
          appended.push({
            sequence,
            channel: {
              id: channelRow.id,
              workspaceId: channelRow.workspace_id,
              name: channelRow.name,
              missionBrief: channelRow.mission_brief,
              summary: channelRow.summary,
              policyJson: (channelRow.policy_json ?? {}) as Record<string, unknown>,
              nextSequence,
              status: channelRow.status as ChannelRecord["status"],
              createdBy: channelRow.created_by,
              createdAt: asIso(channelRow.created_at),
              updatedAt: membershipEvent.event.createdAt,
            },
            envelope: written.envelope,
            event: written.event,
          });
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
        return {
          ok: true,
          ...(appended.length > 0 ? { events: appended } : {}),
        } satisfies CoworkerUpdateResult & { events?: AppendChannelEventResult[] };
      });
    },
    async disableCoworkerCleanup(input) {
      return sql.begin(async (tx) => {
        // Global lock order: channels (sorted) before agent_profiles — matches
        // commitCoworkerUpdate / upsertParticipantMembership.
        const channelIds = [
          ...new Set((input.removalEvents ?? []).map((row) => row.channelId)),
        ].sort();
        const lockedChannels = new Map<
          string,
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
          }
        >();
        for (const channelId of channelIds) {
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
            SELECT * FROM channels WHERE id = ${channelId} FOR UPDATE
          `;
          if (channelRows[0]) {
            lockedChannels.set(channelId, channelRows[0]);
          }
        }

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

        const appended: AppendChannelEventResult[] = [];
        for (const removal of [...(input.removalEvents ?? [])].sort((a, b) =>
          a.channelId.localeCompare(b.channelId),
        )) {
          const channelRow = lockedChannels.get(removal.channelId);
          if (!channelRow) {
            continue;
          }
          const sequence = channelRow.next_sequence;
          const written = await insertDurableEventSql(
            tx as unknown as SqlClient,
            removal.channelId,
            sequence,
            removal.event,
          );
          const nextSequence = sequence + 1;
          channelRow.next_sequence = nextSequence;
          await tx`
            UPDATE channels
            SET next_sequence = ${nextSequence},
                updated_at = ${removal.event.createdAt}
            WHERE id = ${removal.channelId}
          `;
          appended.push({
            sequence,
            channel: {
              id: channelRow.id,
              workspaceId: channelRow.workspace_id,
              name: channelRow.name,
              missionBrief: channelRow.mission_brief,
              summary: channelRow.summary,
              policyJson: (channelRow.policy_json ?? {}) as Record<string, unknown>,
              nextSequence,
              status: channelRow.status as ChannelRecord["status"],
              createdBy: channelRow.created_by,
              createdAt: asIso(channelRow.created_at),
              updatedAt: removal.event.createdAt,
            },
            envelope: written.envelope,
            event: written.event,
          });
        }

        await tx`
          UPDATE channel_participants
          SET removed_at = ${input.revokeAt}
          WHERE participant_type = 'coworker'
            AND participant_id = ${input.coworker.id}
            AND removed_at IS NULL
        `;
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
        return {
          ok: true,
          ...(appended.length > 0 ? { events: appended } : {}),
        } satisfies CoworkerMutationResult & { events?: AppendChannelEventResult[] };
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
    async getMessageByEventId(eventId) {
      const rows = await db.select().from(messages).where(eq(messages.eventId, eventId)).limit(1);
      return rows[0] ? mapMessage(rows[0]) : null;
    },
    async getPin(id) {
      const rows = await db.select().from(channelPins).where(eq(channelPins.id, id)).limit(1);
      return rows[0] ? mapPin(rows[0]) : null;
    },
    async listActivePins(channelId) {
      const rows = await db
        .select()
        .from(channelPins)
        .where(and(eq(channelPins.channelId, channelId), isNull(channelPins.removedAt)));
      return rows.map(mapPin).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async findActivePinBySource(input) {
      const rows = await db
        .select()
        .from(channelPins)
        .where(and(eq(channelPins.channelId, input.channelId), isNull(channelPins.removedAt)));
      const match = rows.find((row) => {
        if (input.sourceEventId) {
          return row.sourceEventId === input.sourceEventId;
        }
        if (input.sourceArtifactId) {
          return row.sourceArtifactId === input.sourceArtifactId;
        }
        return false;
      });
      return match ? mapPin(match) : null;
    },
    async getArtifact(id) {
      const rows = await db.select().from(artifacts).where(eq(artifacts.id, id)).limit(1);
      return rows[0] ? mapSafeArtifact(rows[0]) : null;
    },
    async listSafeArtifacts(channelId) {
      const rows = await db.select().from(artifacts).where(eq(artifacts.channelId, channelId));
      return rows.map(mapSafeArtifact).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async insertArtifact(artifact) {
      await sql`
        INSERT INTO artifacts (
          id, workspace_id, channel_id, run_id, run_step_id, creator_agent_id,
          kind, name, mime_type, storage_key, byte_size, sha256,
          source_sandbox_id, source_sandbox_path, revision, metadata_json, created_at
        )
        VALUES (
          ${artifact.id},
          ${artifact.workspaceId},
          ${artifact.channelId},
          ${artifact.runId},
          ${artifact.runStepId},
          ${artifact.creatorAgentId},
          ${artifact.kind},
          ${artifact.name},
          ${artifact.mimeType},
          ${`fixture://${artifact.id}`},
          ${artifact.byteSize},
          ${artifact.sha256},
          NULL,
          NULL,
          ${artifact.revision},
          ${JSON.stringify({})}::jsonb,
          ${artifact.createdAt}
        )
      `;
    },
    async getChannelAgentSession(id) {
      const rows = await db
        .select()
        .from(channelAgentSessions)
        .where(eq(channelAgentSessions.id, id))
        .limit(1);
      return rows[0] ? mapAgentSession(rows[0]) : null;
    },
    async upsertChannelAgentSession(session) {
      await sql`
        INSERT INTO channel_agent_sessions (
          id, workspace_id, channel_id, agent_profile_id, logical_agui_thread_id,
          current_generation_id, last_delivered_channel_sequence, state, created_at, updated_at
        )
        VALUES (
          ${session.id},
          ${session.workspaceId},
          ${session.channelId},
          ${session.agentProfileId},
          ${session.logicalAguiThreadId},
          ${session.currentGenerationId},
          ${session.lastDeliveredChannelSequence},
          ${session.state},
          ${session.createdAt},
          ${session.updatedAt}
        )
        ON CONFLICT (id) DO UPDATE SET
          last_delivered_channel_sequence = EXCLUDED.last_delivered_channel_sequence,
          state = EXCLUDED.state,
          current_generation_id = EXCLUDED.current_generation_id,
          updated_at = EXCLUDED.updated_at
      `;
    },
    async setSessionDeliveryCursor(sessionId, nextSequence, updatedAt) {
      const rows = await sql<
        {
          id: string;
          workspace_id: string;
          channel_id: string;
          agent_profile_id: string;
          logical_agui_thread_id: string;
          current_generation_id: string | null;
          last_delivered_channel_sequence: number;
          state: string;
          created_at: string | Date;
          updated_at: string | Date;
        }[]
      >`
        UPDATE channel_agent_sessions
        SET last_delivered_channel_sequence = ${nextSequence},
            updated_at = ${updatedAt}
        WHERE id = ${sessionId}
          AND last_delivered_channel_sequence <= ${nextSequence}
        RETURNING *
      `;
      const row = rows[0];
      if (!row) {
        // Missing session, or a concurrent writer already advanced past nextSequence.
        return this.getChannelAgentSession(sessionId);
      }
      return {
        id: row.id,
        workspaceId: row.workspace_id,
        channelId: row.channel_id,
        agentProfileId: row.agent_profile_id,
        logicalAguiThreadId: row.logical_agui_thread_id,
        currentGenerationId: row.current_generation_id,
        lastDeliveredChannelSequence: row.last_delivered_channel_sequence,
        state: row.state as ChannelAgentSessionRecord["state"],
        createdAt: asIso(row.created_at),
        updatedAt: asIso(row.updated_at),
      } satisfies ChannelAgentSessionRecord;
    },
    async listEventsAfter(channelId, afterSequence, options) {
      const limit = clampEventLimit(options?.limit);
      const rows = await sql<
        {
          id: string;
          channel_id: string;
          sequence: number;
          type: string;
          actor_type: string;
          actor_id: string;
          run_id: string | null;
          payload_json: unknown;
          agui_event_type: string | null;
          agui_event_json: unknown;
          logical_thread_id: string | null;
          created_at: string | Date;
          source_message_id: string | null;
        }[]
      >`
        SELECT e.id, e.channel_id, e.sequence, e.type, e.actor_type, e.actor_id, e.run_id,
               e.payload_json, e.agui_event_type, e.agui_event_json, e.logical_thread_id, e.created_at,
               m.id AS source_message_id
        FROM channel_events e
        LEFT JOIN messages m ON m.event_id = e.id
        WHERE e.channel_id = ${channelId}
          AND e.sequence > ${afterSequence}
        ORDER BY e.sequence ASC
        LIMIT ${limit + 1}
      `;
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit).map(
        (row) =>
          ({
            id: row.id,
            channelId: row.channel_id,
            sequence: row.sequence,
            type: row.type,
            actorType: row.actor_type as ChannelEventRecord["actorType"],
            actorId: row.actor_id,
            runId: row.run_id,
            payloadJson: row.payload_json,
            aguiEventType: row.agui_event_type,
            aguiEventJson: (row.agui_event_json ?? null) as ChannelEventRecord["aguiEventJson"],
            logicalThreadId: row.logical_thread_id,
            createdAt: asIso(row.created_at),
            sourceMessageId: row.source_message_id,
          }) satisfies ChannelEventRecord,
      );
      return { events: page, hasMore } satisfies ListEventsAfterResult;
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
      const decoded = decodeReceiptResultId(row.resultId);
      return {
        workspaceId: row.workspaceId,
        commandKind: row.commandKind,
        idempotencyKey: row.idempotencyKey,
        resultId: decoded.resultId,
        leaseOwner: decoded.leaseOwner,
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
          ${encodeReceiptResultId(receipt.resultId, receipt.leaseOwner)},
          ${receipt.createdAt}
        )
        ON CONFLICT (workspace_id, command_kind, idempotency_key) DO NOTHING
        RETURNING result_id
      `;
      return inserted.length > 0;
    },
    async touchCommandReceipt(workspaceId, commandKind, idempotencyKey, leaseOwner, touchedAt) {
      const updated = await sql`
        UPDATE workspace_command_receipts
        SET created_at = ${touchedAt}
        WHERE workspace_id = ${workspaceId}
          AND command_kind = ${commandKind}
          AND idempotency_key = ${idempotencyKey}
          AND result_id LIKE ${"%\u001f" + leaseOwner}
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
    async deleteCommandReceipt(workspaceId, commandKind, idempotencyKey, leaseOwner) {
      await sql`
        DELETE FROM workspace_command_receipts
        WHERE workspace_id = ${workspaceId}
          AND command_kind = ${commandKind}
          AND idempotency_key = ${idempotencyKey}
          AND result_id LIKE ${"%\u001f" + leaseOwner}
      `;
    },
    async insertChannelWithOwner(channel, owner, createdEvent) {
      return sql.begin(async (tx) => {
        if (channel.nextSequence !== 1) {
          throw new Error("channel create must seed nextSequence=1 after sequence 0 create event");
        }
        await tx.unsafe(
          `INSERT INTO channels (
            id, workspace_id, name, mission_brief, summary, policy_json,
            next_sequence, status, created_by, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6::jsonb,
            $7, $8, $9, $10, $11
          )`,
          [
            channel.id,
            channel.workspaceId,
            channel.name,
            channel.missionBrief,
            channel.summary,
            JSON.stringify(channel.policyJson ?? {}),
            0,
            channel.status,
            channel.createdBy,
            channel.createdAt,
            channel.updatedAt,
          ],
        );
        await upsertParticipantSql(tx as unknown as SqlClient, owner);
        const written = await insertDurableEventSql(
          tx as unknown as SqlClient,
          channel.id,
          0,
          createdEvent,
        );
        await tx`
          UPDATE channels
          SET next_sequence = ${1},
              updated_at = ${createdEvent.createdAt}
          WHERE id = ${channel.id}
        `;
        return {
          sequence: 0,
          channel: {
            ...channel,
            nextSequence: 1,
            updatedAt: createdEvent.createdAt,
          },
          envelope: written.envelope,
          event: written.event,
        } satisfies AppendChannelEventResult;
      });
    },
    async appendChannelEvent(input) {
      return sql.begin(async (tx) => {
        const locked = await tx<
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
          WHERE id = ${input.channelId}
          FOR UPDATE
        `;
        const current = locked[0];
        if (!current) {
          throw new Error(`channel ${input.channelId} not found`);
        }
        if (current.status === "archived" && !input.allowArchived) {
          throw new Error("channel_archived");
        }
        const sequence = current.next_sequence;
        const written = await insertDurableEventSql(
          tx as unknown as SqlClient,
          input.channelId,
          sequence,
          input.event,
        );
        const nextSequence = sequence + 1;
        const patch = input.channelPatch;
        const updatedAt = patch?.updatedAt ?? input.event.createdAt;
        const nextName = patch?.name ?? current.name;
        const nextBrief = patch?.missionBrief ?? current.mission_brief;
        const nextSummary = patch?.summary !== undefined ? patch.summary : current.summary;
        const nextPolicy = patch?.policyJson ?? current.policy_json ?? {};
        const nextStatus = patch?.status ?? current.status;
        await tx.unsafe(
          `UPDATE channels
           SET next_sequence = $1,
               name = $2,
               mission_brief = $3,
               summary = $4,
               policy_json = $5::jsonb,
               status = $6,
               updated_at = $7
           WHERE id = $8`,
          [
            nextSequence,
            nextName,
            nextBrief,
            nextSummary,
            JSON.stringify(nextPolicy),
            nextStatus,
            updatedAt,
            input.channelId,
          ],
        );
        if (input.message) {
          await tx`
            INSERT INTO messages (
              id, channel_id, event_id, author_type, author_id, body, parent_message_id, created_at
            )
            VALUES (
              ${input.message.id},
              ${input.message.channelId},
              ${input.message.eventId},
              ${input.message.authorType},
              ${input.message.authorId},
              ${input.message.body},
              ${input.message.parentMessageId},
              ${input.message.createdAt}
            )
          `;
        }
        if (input.participantUpsert) {
          await upsertParticipantSql(tx as unknown as SqlClient, input.participantUpsert);
        }
        return {
          sequence,
          channel: {
            id: current.id,
            workspaceId: current.workspace_id,
            name: nextName,
            missionBrief: nextBrief,
            summary: nextSummary,
            policyJson: nextPolicy as Record<string, unknown>,
            nextSequence,
            status: nextStatus as ChannelRecord["status"],
            createdBy: current.created_by,
            createdAt: asIso(current.created_at),
            updatedAt,
          },
          envelope: written.envelope,
          event: written.event,
        } satisfies AppendChannelEventResult;
      });
    },
    async appendMessage(input) {
      return this.appendChannelEvent({
        channelId: input.channelId,
        event: input.event,
        message: input.message,
      });
    },
    async createPinWithEvent(input) {
      return sql.begin(async (tx) => {
        if (input.pin.channelId !== input.channelId) {
          throw new Error("pin channel mismatch");
        }
        const sourceCount =
          Number(input.pin.sourceEventId !== null) + Number(input.pin.sourceArtifactId !== null);
        if (sourceCount !== 1) {
          throw new Error("pin must reference exactly one source");
        }
        const locked = await tx<
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
          WHERE id = ${input.channelId}
          FOR UPDATE
        `;
        const current = locked[0];
        if (!current) {
          throw new Error(`channel ${input.channelId} not found`);
        }
        if (current.status === "archived") {
          throw new Error("channel_archived");
        }
        const conflict = await tx<{ id: string }[]>`
          SELECT id
          FROM channel_pins
          WHERE channel_id = ${input.channelId}
            AND removed_at IS NULL
            AND (
              (${input.pin.sourceEventId}::text IS NOT NULL AND source_event_id = ${input.pin.sourceEventId})
              OR (${input.pin.sourceArtifactId}::text IS NOT NULL AND source_artifact_id = ${input.pin.sourceArtifactId})
            )
          LIMIT 1
        `;
        if (conflict.length > 0) {
          throw new Error("pin_source_conflict");
        }
        const sequence = current.next_sequence;
        const written = await insertDurableEventSql(
          tx as unknown as SqlClient,
          input.channelId,
          sequence,
          input.event,
        );
        const nextSequence = sequence + 1;
        await tx`
          UPDATE channels
          SET next_sequence = ${nextSequence},
              updated_at = ${input.event.createdAt}
          WHERE id = ${input.channelId}
        `;
        await tx`
          INSERT INTO channel_pins (
            id, channel_id, source_event_id, source_artifact_id,
            label, pinned_by, created_at, removed_at
          )
          VALUES (
            ${input.pin.id},
            ${input.pin.channelId},
            ${input.pin.sourceEventId},
            ${input.pin.sourceArtifactId},
            ${input.pin.label},
            ${input.pin.pinnedBy},
            ${input.pin.createdAt},
            ${input.pin.removedAt}
          )
        `;
        return {
          sequence,
          channel: {
            id: current.id,
            workspaceId: current.workspace_id,
            name: current.name,
            missionBrief: current.mission_brief,
            summary: current.summary,
            policyJson: (current.policy_json ?? {}) as Record<string, unknown>,
            nextSequence,
            status: current.status as ChannelRecord["status"],
            createdBy: current.created_by,
            createdAt: asIso(current.created_at),
            updatedAt: input.event.createdAt,
          },
          envelope: written.envelope,
          event: written.event,
          pin: structuredClone(input.pin),
        } satisfies AppendChannelEventResult & { pin: PinRecord };
      });
    },
    async removePinWithEvent(input) {
      return sql.begin(async (tx) => {
        const locked = await tx<
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
          WHERE id = ${input.channelId}
          FOR UPDATE
        `;
        const current = locked[0];
        if (!current) {
          throw new Error(`channel ${input.channelId} not found`);
        }
        if (current.status === "archived") {
          throw new Error("channel_archived");
        }
        const pinRows = await tx<
          {
            id: string;
            channel_id: string;
            source_event_id: string | null;
            source_artifact_id: string | null;
            label: string;
            pinned_by: string;
            created_at: string | Date;
            removed_at: string | Date | null;
          }[]
        >`
          SELECT *
          FROM channel_pins
          WHERE id = ${input.pinId}
            AND channel_id = ${input.channelId}
          FOR UPDATE
        `;
        const pinRow = pinRows[0];
        if (!pinRow) {
          throw new Error("pin_not_found");
        }
        if (pinRow.removed_at !== null) {
          throw new Error("pin_already_removed");
        }
        const sequence = current.next_sequence;
        const written = await insertDurableEventSql(
          tx as unknown as SqlClient,
          input.channelId,
          sequence,
          input.event,
        );
        const nextSequence = sequence + 1;
        await tx`
          UPDATE channels
          SET next_sequence = ${nextSequence},
              updated_at = ${input.event.createdAt}
          WHERE id = ${input.channelId}
        `;
        await tx`
          UPDATE channel_pins
          SET removed_at = ${input.removedAt}
          WHERE id = ${input.pinId}
        `;
        const pin: PinRecord = {
          id: pinRow.id,
          channelId: pinRow.channel_id,
          sourceEventId: pinRow.source_event_id,
          sourceArtifactId: pinRow.source_artifact_id,
          label: pinRow.label,
          pinnedBy: pinRow.pinned_by,
          createdAt: asIso(pinRow.created_at),
          removedAt: input.removedAt,
        };
        return {
          sequence,
          channel: {
            id: current.id,
            workspaceId: current.workspace_id,
            name: current.name,
            missionBrief: current.mission_brief,
            summary: current.summary,
            policyJson: (current.policy_json ?? {}) as Record<string, unknown>,
            nextSequence,
            status: current.status as ChannelRecord["status"],
            createdBy: current.created_by,
            createdAt: asIso(current.created_at),
            updatedAt: input.event.createdAt,
          },
          envelope: written.envelope,
          event: written.event,
          pin,
        } satisfies AppendChannelEventResult & { pin: PinRecord };
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
