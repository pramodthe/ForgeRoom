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
  taskRevisions,
  tasks,
  taskGrants,
  workspaceCommandReceipts,
} from "@forgeroom/db";
import type {
  CoworkerDraftState,
  CoworkerEffectivePreview,
  CoworkerProposal,
} from "@forgeroom/contracts";
import type { TaskStatus } from "@forgeroom/contracts";
import { and, eq, isNull } from "drizzle-orm";
import { randomOpaqueId } from "../auth/crypto";
import { clampEventLimit } from "./event-read";
import {
  hashAguiEvent,
  materializeChannelEvent,
  resolveAguiEventRecordMessageOrActivityId,
  resolveAguiRunIdFromPersistedEvent,
} from "./event-persist";
import type {
  AppendChannelEventResult,
  AuditEventRecord,
  ChannelAgentSessionRecord,
  ChannelAgentSessionUpsertInput,
  ChannelEventInsert,
  ChannelEventRecord,
  ChannelPatch,
  ChannelRecord,
  CommandReceipt,
  CoworkerEditableConfig,
  CoworkerDraftRecord,
  CoworkerDraftWriteResult,
  CoworkerMutationResult,
  CoworkerRecord,
  CoworkerUpdateResult,
  ProvisionCoworkerFromDraftInput,
  ListEventsAfterResult,
  MembershipWriteResult,
  MessageRecord,
  ParticipantRecord,
  PinRecord,
  SafeArtifactRecord,
  TaskGrantRecord,
  TaskRecord,
  TaskRevisionRecord,
  TaskWriteResult,
  RunProvenanceRecord,
  TaskWriteFailureReason,
  TaskToolGenerationGuard,
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

function mapCoworkerDraft(row: {
  id: string;
  workspace_id: string;
  source_text_encrypted: string;
  proposal_json: unknown;
  effective_preview_json: unknown;
  draft_hash: string;
  revision: number;
  policy_revision: number;
  catalog_revision: number;
  state: string;
  created_by: string;
  expires_at: string | Date;
  created_at: string | Date;
  decided_at: string | Date | null;
}): CoworkerDraftRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    revision: row.revision,
    draftHash: row.draft_hash,
    policyRevision: row.policy_revision,
    catalogRevision: row.catalog_revision,
    state: row.state as CoworkerDraftState,
    proposal: row.proposal_json as CoworkerProposal,
    effectivePreview: row.effective_preview_json as CoworkerEffectivePreview,
    sourceTextEncrypted: row.source_text_encrypted,
    createdBy: row.created_by,
    expiresAt: asIso(row.expires_at),
    createdAt: asIso(row.created_at),
    decidedAt: row.decided_at ? asIso(row.decided_at) : null,
  };
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
      ? (row.allowedTransitionsJson as Array<{ from: TaskStatus; to: TaskStatus }>)
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

function mapTask(row: typeof tasks.$inferSelect): TaskRecord {
  return {
    schemaVersion: 1,
    id: row.id,
    workspace_id: row.workspaceId,
    channel_id: row.channelId,
    title: row.title,
    description: row.description,
    status: row.status as TaskRecord["status"],
    assignee_type: row.assigneeType as TaskRecord["assignee_type"],
    assignee_id: row.assigneeId,
    source_message_id: row.sourceMessageId,
    source_run_id: row.sourceRunId,
    due_at: row.dueAt ? asIso(row.dueAt) : null,
    current_revision: row.currentRevision,
    created_by_type: row.createdByType as TaskRecord["created_by_type"],
    created_by_id: row.createdById,
    created_at: asIso(row.createdAt),
    updated_at: asIso(row.updatedAt),
  };
}

function mapTaskRevision(row: typeof taskRevisions.$inferSelect): TaskRevisionRecord {
  return {
    schemaVersion: 1,
    id: row.id,
    task_id: row.taskId,
    revision: row.revision,
    data: row.dataJson as TaskRevisionRecord["data"],
    data_hash: row.dataHash,
    changed_fields: row.changedFieldsJson as string[],
    actor_type: row.actorType as TaskRevisionRecord["actor_type"],
    actor_id: row.actorId,
    command_id: row.commandId,
    created_at: asIso(row.createdAt),
  };
}

function mapRunProvenance(row: {
  id: string;
  workspace_id: string;
  channel_id: string;
}): RunProvenanceRecord {
  return { id: row.id, workspaceId: row.workspace_id, channelId: row.channel_id };
}

async function insertAuditEventSql(tx: SqlClient, audit: AuditEventRecord): Promise<void> {
  await tx.unsafe(
    `INSERT INTO audit_events (
      id, workspace_id, channel_id, actor_type, actor_id, action, target_type, target_id,
      redacted_payload_json, payload_hash, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)`,
    [
      audit.id,
      audit.workspaceId,
      audit.channelId,
      audit.actorType,
      audit.actorId,
      audit.action,
      audit.targetType,
      audit.targetId,
      JSON.stringify(audit.redactedPayloadJson),
      audit.payloadHash,
      audit.createdAt,
    ],
  );
}

async function validateTaskWriteSql(
  tx: SqlClient,
  task: TaskRecord,
): Promise<TaskWriteFailureReason | null> {
  const channelRows = await tx<{ workspace_id: string; status: string }[]>`
    SELECT workspace_id, status FROM channels WHERE id = ${task.channel_id} FOR SHARE
  `;
  const channel = channelRows[0];
  if (!channel || channel.workspace_id !== task.workspace_id) {
    return "invalid_provenance";
  }
  if (channel.status === "archived") {
    return "channel_archived";
  }
  if (task.source_run_id) {
    const runRows = await tx<{ channel_id: string; workspace_id: string }[]>`
      SELECT r.channel_id, c.workspace_id
      FROM runs AS r
      JOIN channels AS c ON c.id = r.channel_id
      WHERE r.id = ${task.source_run_id}
      FOR SHARE
    `;
    const run = runRows[0];
    if (!run || run.workspace_id !== task.workspace_id || run.channel_id !== task.channel_id) {
      return "invalid_provenance";
    }
  }
  if (task.assignee_type === "coworker") {
    const coworkerRows = await tx<{ workspace_id: string; status: string }[]>`
      SELECT workspace_id, status FROM agent_profiles WHERE id = ${task.assignee_id} FOR SHARE
    `;
    const coworker = coworkerRows[0];
    if (!coworker || coworker.workspace_id !== task.workspace_id || coworker.status !== "active") {
      return "invalid_assignee";
    }
    const participantRows = await tx<{ participant_id: string }[]>`
      SELECT participant_id
      FROM channel_participants
      WHERE channel_id = ${task.channel_id}
        AND participant_type = 'coworker'
        AND participant_id = ${task.assignee_id}
        AND removed_at IS NULL
      FOR SHARE
    `;
    if (participantRows.length === 0) {
      return "invalid_assignee";
    }
  }
  return null;
}

function applicationToolNames(value: unknown): string[] {
  const config =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value) as unknown;
          } catch {
            return null;
          }
        })()
      : value;
  if (!config || typeof config !== "object" || Array.isArray(config)) return [];
  const names = (config as Record<string, unknown>).application_tool_names;
  return Array.isArray(names)
    ? names.filter((name): name is string => typeof name === "string")
    : [];
}

async function validateTaskToolGenerationGuardSql(
  tx: SqlClient,
  task: TaskRecord,
  guard: TaskToolGenerationGuard | undefined,
): Promise<TaskWriteFailureReason | null> {
  if (!guard) return null;
  const rows = await tx<
    {
      effective_config: unknown;
    }[]
  >`
    SELECT sr.effective_config_redacted_json AS effective_config
    FROM channel_agent_sessions AS cas
    JOIN channel_agent_session_generations AS gen
      ON gen.channel_agent_session_id = cas.id
    JOIN session_revisions AS sr ON sr.id = gen.session_revision_id
    WHERE cas.id = ${guard.channelAgentSessionId}
      AND gen.id = ${guard.generationId}
      AND gen.generation = ${guard.expectedGeneration}
      AND gen.id = cas.current_generation_id
      AND gen.state = 'ready'
      AND cas.state = 'active'
      AND cas.workspace_id = ${guard.workspaceId}
      AND cas.channel_id = ${guard.channelId}
      AND cas.agent_profile_id = ${guard.coworkerId}
      AND ${task.workspace_id} = ${guard.workspaceId}
      AND ${task.channel_id} = ${guard.channelId}
    FOR UPDATE OF cas, gen
  `;
  const row = rows[0];
  if (!row) return "stale_generation";
  return applicationToolNames(row.effective_config).includes(guard.applicationToolName)
    ? null
    : "application_tool_not_offered";
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

async function resolveAguiRunId(
  tx: SqlClient,
  insert: ChannelEventInsert,
  envelope: AppendChannelEventResult["envelope"],
): Promise<string | null> {
  if (insert.draft.aguiRunId) {
    return insert.draft.aguiRunId;
  }
  const fromEvent = resolveAguiRunIdFromPersistedEvent(envelope.aguiEvent);
  if (fromEvent) {
    return fromEvent;
  }
  const agentTurnId = envelope.agentTurnId ?? insert.draft.agentTurnId;
  if (!agentTurnId) {
    return null;
  }
  const rows = await tx<{ agui_run_id: string }[]>`
    SELECT agui_run_id FROM agent_turns WHERE id = ${agentTurnId} LIMIT 1
  `;
  return rows[0]?.agui_run_id ?? null;
}

async function insertDurableEventSql(
  tx: SqlClient,
  channelId: string,
  sequence: number,
  insert: ChannelEventInsert,
): Promise<{ envelope: AppendChannelEventResult["envelope"]; event: ChannelEventRecord }> {
  const { envelope, event } = materializeChannelEvent(channelId, sequence, insert);
  const aguiRunId = await resolveAguiRunId(tx, insert, envelope);
  const messageOrActivityId = resolveAguiEventRecordMessageOrActivityId(
    envelope.aguiEvent,
    envelope.sourceMessageId,
  );
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
      aguiRunId,
      envelope.aguiEvent.type,
      messageOrActivityId,
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
    async getTask(id) {
      const rows = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
      return rows[0] ? mapTask(rows[0]) : null;
    },
    async getRunProvenance(id) {
      const rows = await sql<{ id: string; workspace_id: string; channel_id: string }[]>`
        SELECT r.id, r.channel_id, c.workspace_id
        FROM runs AS r
        JOIN channels AS c ON c.id = r.channel_id
        WHERE r.id = ${id}
        LIMIT 1
      `;
      return rows[0] ? mapRunProvenance(rows[0]) : null;
    },
    async listAuditEvents(workspaceId, targetId) {
      const rows = await sql<
        {
          id: string;
          workspace_id: string;
          channel_id: string | null;
          actor_type: string;
          actor_id: string;
          action: string;
          target_type: string;
          target_id: string;
          redacted_payload_json: Record<string, unknown>;
          payload_hash: string;
          created_at: string | Date;
        }[]
      >`
        SELECT id, workspace_id, channel_id, actor_type, actor_id, action,
               target_type, target_id, redacted_payload_json, payload_hash, created_at
        FROM audit_events
        WHERE workspace_id = ${workspaceId}
          ${targetId ? sql`AND target_id = ${targetId}` : sql``}
        ORDER BY created_at ASC, id ASC
      `;
      return rows.map((row) => ({
        id: row.id,
        workspaceId: row.workspace_id,
        channelId: row.channel_id,
        actorType: row.actor_type as AuditEventRecord["actorType"],
        actorId: row.actor_id,
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id,
        redactedPayloadJson: row.redacted_payload_json,
        payloadHash: row.payload_hash,
        createdAt: asIso(row.created_at),
      }));
    },
    async appendAuditEvent(audit) {
      await insertAuditEventSql(sql, audit);
    },
    async listTasks(channelId) {
      const rows = await db.select().from(tasks).where(eq(tasks.channelId, channelId));
      return rows.map(mapTask).sort((a, b) => a.created_at.localeCompare(b.created_at));
    },
    async listTaskHistory(taskId) {
      const rows = await db.select().from(taskRevisions).where(eq(taskRevisions.taskId, taskId));
      return rows.map(mapTaskRevision).sort((a, b) => a.revision - b.revision);
    },
    async insertTaskWithRevision(input): Promise<TaskWriteResult> {
      let result: AppendChannelEventResult | TaskWriteResult;
      try {
        result = await sql.begin(async (tx) => {
          const guardFailure = await validateTaskToolGenerationGuardSql(
            tx as unknown as SqlClient,
            input.task,
            input.generationGuard,
          );
          if (guardFailure) return { ok: false, reason: guardFailure } satisfies TaskWriteResult;
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
          >`SELECT * FROM channels WHERE id = ${input.task.channel_id} FOR UPDATE`;
          const channel = channelRows[0];
          if (!channel) throw new Error("channel_not_found");
          if (channel.status === "archived") {
            return { ok: false, reason: "channel_archived" } satisfies TaskWriteResult;
          }
          const invalid = await validateTaskWriteSql(tx as unknown as SqlClient, input.task);
          if (invalid) return { ok: false, reason: invalid } satisfies TaskWriteResult;
          await tx`
            INSERT INTO tasks (
              id, workspace_id, channel_id, title, description, status,
              assignee_type, assignee_id, source_message_id, source_run_id,
              due_at, current_revision, created_by_type, created_by_id, created_at, updated_at
            ) VALUES (
              ${input.task.id}, ${input.task.workspace_id}, ${input.task.channel_id},
              ${input.task.title}, ${input.task.description}, ${input.task.status},
              ${input.task.assignee_type}, ${input.task.assignee_id},
              ${input.task.source_message_id}, ${input.task.source_run_id},
              ${input.task.due_at}, ${input.task.current_revision},
              ${input.task.created_by_type}, ${input.task.created_by_id},
              ${input.task.created_at}, ${input.task.updated_at}
            )
          `;
          await tx`
            INSERT INTO task_revisions (
              id, task_id, revision, data_json, data_hash, changed_fields_json,
              actor_type, actor_id, command_id, created_at
            ) VALUES (
              ${input.revision.id}, ${input.revision.task_id}, ${input.revision.revision},
              ${JSON.stringify(input.revision.data)}::jsonb, ${input.revision.data_hash},
              ${JSON.stringify(input.revision.changed_fields)}::jsonb,
              ${input.revision.actor_type}, ${input.revision.actor_id},
              ${input.revision.command_id}, ${input.revision.created_at}
            )
          `;
          await insertAuditEventSql(tx as unknown as SqlClient, input.audit);
          const sequence = channel.next_sequence;
          const written = await insertDurableEventSql(
            tx as unknown as SqlClient,
            input.task.channel_id,
            sequence,
            input.event,
          );
          await tx`
            UPDATE channels SET next_sequence = ${sequence + 1}, updated_at = ${input.event.createdAt}
            WHERE id = ${input.task.channel_id}
          `;
          return {
            sequence,
            channel: {
              id: channel.id,
              workspaceId: channel.workspace_id,
              name: channel.name,
              missionBrief: channel.mission_brief,
              summary: channel.summary,
              policyJson: (channel.policy_json ?? {}) as Record<string, unknown>,
              nextSequence: sequence + 1,
              status: channel.status as ChannelRecord["status"],
              createdBy: channel.created_by,
              createdAt: asIso(channel.created_at),
              updatedAt: input.event.createdAt,
            },
            envelope: written.envelope,
            event: written.event,
          } satisfies AppendChannelEventResult;
        });
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "23505"
        ) {
          return { ok: false, reason: "conflict" };
        }
        throw error;
      }
      if ("ok" in result) return result;
      return { ok: true, task: input.task, revision: input.revision, event: result };
    },
    async updateTaskWithRevision(input): Promise<TaskWriteResult> {
      return sql.begin(async (tx) => {
        const guardFailure = await validateTaskToolGenerationGuardSql(
          tx as unknown as SqlClient,
          input.task,
          input.generationGuard,
        );
        if (guardFailure) return { ok: false, reason: guardFailure } satisfies TaskWriteResult;
        const rows = await tx<{ current_revision: number; channel_id: string }[]>`
          SELECT current_revision, channel_id FROM tasks WHERE id = ${input.task.id} FOR UPDATE
        `;
        const current = rows[0];
        if (!current) return { ok: false, reason: "not_found" };
        if (current.current_revision !== input.expectedRevision) {
          return { ok: false, reason: "conflict", actualRevision: current.current_revision };
        }
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
        >`SELECT * FROM channels WHERE id = ${current.channel_id} FOR UPDATE`;
        const channel = channelRows[0];
        if (!channel) return { ok: false, reason: "not_found" };
        if (channel.status === "archived") {
          return { ok: false, reason: "channel_archived" };
        }
        const invalid = await validateTaskWriteSql(tx as unknown as SqlClient, input.task);
        if (invalid) return { ok: false, reason: invalid };
        await tx`
          UPDATE tasks SET
            title = ${input.task.title}, description = ${input.task.description},
            status = ${input.task.status}, assignee_type = ${input.task.assignee_type},
            assignee_id = ${input.task.assignee_id}, source_message_id = ${input.task.source_message_id},
            source_run_id = ${input.task.source_run_id}, due_at = ${input.task.due_at},
            current_revision = ${input.task.current_revision}, updated_at = ${input.task.updated_at}
          WHERE id = ${input.task.id}
        `;
        await tx`
          INSERT INTO task_revisions (
            id, task_id, revision, data_json, data_hash, changed_fields_json,
            actor_type, actor_id, command_id, created_at
          ) VALUES (
            ${input.revision.id}, ${input.revision.task_id}, ${input.revision.revision},
            ${JSON.stringify(input.revision.data)}::jsonb, ${input.revision.data_hash},
            ${JSON.stringify(input.revision.changed_fields)}::jsonb,
            ${input.revision.actor_type}, ${input.revision.actor_id},
            ${input.revision.command_id}, ${input.revision.created_at}
          )
        `;
        await insertAuditEventSql(tx as unknown as SqlClient, input.audit);
        const sequence = channel.next_sequence;
        const written = await insertDurableEventSql(
          tx as unknown as SqlClient,
          current.channel_id,
          sequence,
          input.event,
        );
        await tx`
          UPDATE channels SET next_sequence = ${sequence + 1}, updated_at = ${input.event.createdAt}
          WHERE id = ${current.channel_id}
        `;
        return {
          ok: true,
          task: input.task,
          revision: input.revision,
          event: {
            sequence,
            channel: {
              id: channel.id,
              workspaceId: channel.workspace_id,
              name: channel.name,
              missionBrief: channel.mission_brief,
              summary: channel.summary,
              policyJson: (channel.policy_json ?? {}) as Record<string, unknown>,
              nextSequence: sequence + 1,
              status: channel.status as ChannelRecord["status"],
              createdBy: channel.created_by,
              createdAt: asIso(channel.created_at),
              updatedAt: input.event.createdAt,
            },
            envelope: written.envelope,
            event: written.event,
          },
        };
      });
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
    async listChannelAgentSessions(channelId) {
      const rows = await db
        .select()
        .from(channelAgentSessions)
        .where(eq(channelAgentSessions.channelId, channelId));
      return rows
        .map(mapAgentSession)
        .sort((a, b) => a.agentProfileId.localeCompare(b.agentProfileId));
    },
    async upsertChannelAgentSession(session: ChannelAgentSessionUpsertInput) {
      const now = new Date().toISOString();
      await db
        .insert(channelAgentSessions)
        .values({
          id: session.id,
          workspaceId: session.workspaceId,
          channelId: session.channelId,
          agentProfileId: session.agentProfileId,
          logicalAguiThreadId:
            session.logicalAguiThreadId ?? `thread_${session.channelId}_${session.agentProfileId}`,
          currentGenerationId: session.currentGenerationId ?? null,
          lastDeliveredChannelSequence: session.lastDeliveredChannelSequence ?? 0,
          state: session.state,
          createdAt: session.createdAt ?? now,
          updatedAt: session.updatedAt ?? now,
        })
        .onConflictDoUpdate({
          target: [channelAgentSessions.channelId, channelAgentSessions.agentProfileId],
          set: {
            state: session.state,
            ...(session.logicalAguiThreadId
              ? { logicalAguiThreadId: session.logicalAguiThreadId }
              : {}),
            ...(session.currentGenerationId !== undefined
              ? { currentGenerationId: session.currentGenerationId }
              : {}),
            ...(session.lastDeliveredChannelSequence !== undefined
              ? { lastDeliveredChannelSequence: session.lastDeliveredChannelSequence }
              : {}),
            updatedAt: session.updatedAt ?? now,
          },
        });
    },
    async persistProvisionedSession(input) {
      await sql.begin(async (tx) => {
        await tx`
          INSERT INTO session_revisions (
            id, agent_profile_id, source_config_revision, effective_config_redacted_json,
            effective_spec_hash, approval_policy_hash, created_by, created_at
          ) VALUES (
            ${input.revision.id}, ${input.revision.agentProfileId}, ${input.revision.sourceConfigRevision},
            ${JSON.stringify(input.revision.effectiveConfigRedactedJson)}::jsonb,
            ${input.revision.effectiveSpecHash}, ${input.revision.approvalPolicyHash},
            ${input.revision.createdBy}, ${input.revision.createdAt}
          )
          ON CONFLICT (id) DO NOTHING
        `;
        await tx`
          INSERT INTO channel_agent_sessions (
            id, workspace_id, channel_id, agent_profile_id, logical_agui_thread_id,
            current_generation_id, last_delivered_channel_sequence, state, created_at, updated_at
          ) VALUES (
            ${input.logicalSession.id}, ${input.logicalSession.workspaceId}, ${input.logicalSession.channelId},
            ${input.logicalSession.agentProfileId}, ${input.logicalSession.logicalAguiThreadId},
            NULL, ${input.logicalSession.lastDeliveredChannelSequence}, ${input.logicalSession.state},
            ${input.logicalSession.createdAt}, ${input.logicalSession.updatedAt}
          )
          ON CONFLICT (channel_id, agent_profile_id) DO UPDATE SET
            state = EXCLUDED.state,
            logical_agui_thread_id = EXCLUDED.logical_agui_thread_id,
            updated_at = EXCLUDED.updated_at
        `;
        await tx`
          INSERT INTO channel_agent_session_generations (
            id, channel_agent_session_id, generation, agent_version_id, session_revision_id,
            trueforge_session_id, effective_spec_hash, approval_policy_hash, active_turn_id,
            state, created_at, retired_at
          ) VALUES (
            ${input.generation.id}, ${input.generation.channelAgentSessionId}, ${input.generation.generation},
            ${input.generation.agentVersionId}, ${input.generation.sessionRevisionId},
            ${input.generation.trueforgeSessionId}, ${input.generation.effectiveSpecHash},
            ${input.generation.approvalPolicyHash}, ${input.generation.activeTurnId},
            ${input.generation.state}, ${input.generation.createdAt}, ${input.generation.retiredAt}
          )
        `;
        await tx`
          UPDATE channel_agent_sessions
          SET current_generation_id = ${input.generation.id},
              updated_at = ${input.logicalSession.updatedAt}
          WHERE id = ${input.logicalSession.id}
        `;
      });
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
    async listMessages(channelId, limit = 200) {
      const boundedLimit = Math.min(Math.max(limit, 1), 200);
      const rows = await sql<
        {
          id: string;
          channel_id: string;
          event_id: string;
          author_type: string;
          author_id: string;
          body: string;
          parent_message_id: string | null;
          created_at: string | Date;
          channel_sequence: number;
        }[]
      >`
        SELECT m.*, ce.sequence AS channel_sequence
        FROM messages m
        JOIN channel_events ce ON ce.id = m.event_id
        WHERE m.channel_id = ${channelId}
        ORDER BY ce.sequence DESC
        LIMIT ${boundedLimit}
      `;
      return rows.reverse().map((row) => ({
        id: row.id,
        channelId: row.channel_id,
        eventId: row.event_id,
        authorType: row.author_type as MessageRecord["authorType"],
        authorId: row.author_id,
        body: row.body,
        parentMessageId: row.parent_message_id,
        createdAt: asIso(row.created_at),
        channelSequence: row.channel_sequence,
      }));
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
    async findPinBySource(input) {
      const rows = await db
        .select()
        .from(channelPins)
        .where(eq(channelPins.channelId, input.channelId));
      const match = rows.find((row) => {
        if (input.sourceEventId) return row.sourceEventId === input.sourceEventId;
        if (input.sourceArtifactId) return row.sourceArtifactId === input.sourceArtifactId;
        return false;
      });
      return match ? mapPin(match) : null;
    },
    async getArtifact(id) {
      const rows = await db.select().from(artifacts).where(eq(artifacts.id, id)).limit(1);
      return rows[0] ? mapSafeArtifact(rows[0]) : null;
    },
    async listSafeArtifacts(channelId, workspaceId) {
      const rows = await db
        .select()
        .from(artifacts)
        .where(and(eq(artifacts.channelId, channelId), eq(artifacts.workspaceId, workspaceId)));
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
        SET last_delivered_channel_sequence = GREATEST(
              last_delivered_channel_sequence,
              ${nextSequence}
            ),
            updated_at = CASE
              WHEN last_delivered_channel_sequence < ${nextSequence} THEN ${updatedAt}
              ELSE updated_at
            END
        WHERE id = ${sessionId}
        RETURNING *
      `;
      const row = rows[0];
      if (!row) {
        return null;
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
        resultJson: row.resultJson ?? null,
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
    async rebindCommandReceiptResultId(
      workspaceId,
      commandKind,
      idempotencyKey,
      leaseOwner,
      nextResultId,
    ) {
      const updated = await sql`
        UPDATE workspace_command_receipts
        SET result_id = ${encodeReceiptResultId(nextResultId, leaseOwner)}
        WHERE workspace_id = ${workspaceId}
          AND command_kind = ${commandKind}
          AND idempotency_key = ${idempotencyKey}
          AND result_id LIKE ${"%\u001f" + leaseOwner}
        RETURNING result_id
      `;
      return updated.length > 0;
    },
    async completeCommandReceipt(workspaceId, commandKind, idempotencyKey, leaseOwner, resultJson) {
      const updated = await sql`
        UPDATE workspace_command_receipts
        SET result_json = ${JSON.stringify(resultJson ?? null)}::jsonb
        WHERE workspace_id = ${workspaceId}
          AND command_kind = ${commandKind}
          AND idempotency_key = ${idempotencyKey}
          AND result_id LIKE ${"%\u001f" + leaseOwner}
        RETURNING result_id
      `;
      return updated.length > 0;
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

    async insertCoworkerDraft(draft) {
      await sql`
        INSERT INTO coworker_drafts (
          id, workspace_id, source_text_encrypted, proposal_json, effective_preview_json,
          draft_hash, revision, policy_revision, catalog_revision, state, created_by,
          expires_at, created_at, decided_at
        ) VALUES (
          ${draft.id}, ${draft.workspaceId}, ${draft.sourceTextEncrypted},
          ${JSON.stringify(draft.proposal)}::jsonb, ${JSON.stringify(draft.effectivePreview)}::jsonb,
          ${draft.draftHash}, ${draft.revision}, ${draft.policyRevision}, ${draft.catalogRevision},
          ${draft.state}, ${draft.createdBy}, ${draft.expiresAt}, ${draft.createdAt},
          ${draft.decidedAt}
        )
      `;
    },

    async getCoworkerDraft(id) {
      const rows = await sql<
        Array<{
          id: string;
          workspace_id: string;
          source_text_encrypted: string;
          proposal_json: unknown;
          effective_preview_json: unknown;
          draft_hash: string;
          revision: number;
          policy_revision: number;
          catalog_revision: number;
          state: string;
          created_by: string;
          expires_at: string | Date;
          created_at: string | Date;
          decided_at: string | Date | null;
        }>
      >`
        SELECT *
        FROM coworker_drafts
        WHERE id = ${id}
        LIMIT 1
      `;
      const row = rows[0];
      return row ? mapCoworkerDraft(row) : null;
    },

    async listCoworkerDrafts(workspaceId) {
      const rows = await sql<
        Array<{
          id: string;
          workspace_id: string;
          source_text_encrypted: string;
          proposal_json: unknown;
          effective_preview_json: unknown;
          draft_hash: string;
          revision: number;
          policy_revision: number;
          catalog_revision: number;
          state: string;
          created_by: string;
          expires_at: string | Date;
          created_at: string | Date;
          decided_at: string | Date | null;
        }>
      >`
        SELECT *
        FROM coworker_drafts
        WHERE workspace_id = ${workspaceId}
        ORDER BY created_at DESC, id DESC
      `;
      return rows.map(mapCoworkerDraft);
    },

    async supersedeCoworkerDrafts(input) {
      await sql`
        UPDATE coworker_drafts
        SET state = 'superseded',
            decided_at = ${input.supersededBefore}
        WHERE workspace_id = ${input.workspaceId}
          AND id <> ${input.exceptDraftId}
          AND state IN ('draft', 'awaiting_review')
      `;
    },

    async updateCoworkerDraftState(input) {
      const rows = await sql<
        Array<{
          id: string;
          workspace_id: string;
          source_text_encrypted: string;
          proposal_json: unknown;
          effective_preview_json: unknown;
          draft_hash: string;
          revision: number;
          policy_revision: number;
          catalog_revision: number;
          state: string;
          created_by: string;
          expires_at: string | Date;
          created_at: string | Date;
          decided_at: string | Date | null;
        }>
      >`
        UPDATE coworker_drafts
        SET state = ${input.nextState},
            decided_at = COALESCE(${input.decidedAt ?? null}, decided_at)
        WHERE id = ${input.draftId}
          AND revision = ${input.expectedRevision}
        RETURNING *
      `;
      const row = rows[0];
      if (!row) {
        return null;
      }
      const mapped = mapCoworkerDraft(row);
      return {
        ...mapped,
        confirmIdempotencyKey: input.confirmIdempotencyKey ?? mapped.confirmIdempotencyKey,
        provisionedCoworkerId: input.provisionedCoworkerId ?? mapped.provisionedCoworkerId,
      };
    },

    async provisionCoworkerFromDraft(
      input: ProvisionCoworkerFromDraftInput,
    ): Promise<CoworkerDraftWriteResult> {
      return sql.begin(async (tx) => {
        const draftRows = await tx<
          Array<{
            id: string;
            workspace_id: string;
            source_text_encrypted: string;
            proposal_json: unknown;
            effective_preview_json: unknown;
            draft_hash: string;
            revision: number;
            policy_revision: number;
            catalog_revision: number;
            state: string;
            created_by: string;
            expires_at: string | Date;
            created_at: string | Date;
            decided_at: string | Date | null;
          }>
        >`
          SELECT *
          FROM coworker_drafts
          WHERE id = ${input.draftId}
          FOR UPDATE
        `;
        const draftRow = draftRows[0];
        if (!draftRow) {
          return { ok: false, reason: "not_found" };
        }
        const draft = mapCoworkerDraft(draftRow);
        const proposal = draft.proposal;

        if (new Date(input.now).getTime() > new Date(draft.expiresAt).getTime()) {
          if (draft.state === "awaiting_review") {
            await tx`
              UPDATE coworker_drafts
              SET state = 'expired', decided_at = ${input.now}
              WHERE id = ${input.draftId}
            `;
          }
          return { ok: false, reason: "expired", draft };
        }

        const existingByHandle = await tx<Array<{ id: string }>>`
          SELECT id
          FROM agent_profiles
          WHERE workspace_id = ${draft.workspaceId}
            AND lower(handle) = lower(${proposal.handle})
          LIMIT 1
        `;
        if (existingByHandle[0]) {
          if (
            draft.state === "ready" ||
            draft.state === "confirmed" ||
            draft.state === "provisioning"
          ) {
            const coworkerRows = await tx<
              Array<{
                id: string;
                workspace_id: string;
                handle: string;
                name: string;
                title: string;
                status: string;
                current_version_id: string | null;
                config_revision: number;
                editable_config_json: unknown;
              }>
            >`
              SELECT id, workspace_id, handle, name, title, status, current_version_id,
                     config_revision, editable_config_json
              FROM agent_profiles
              WHERE id = ${existingByHandle[0].id}
              LIMIT 1
            `;
            const coworkerRow = coworkerRows[0];
            if (coworkerRow) {
              return {
                ok: true,
                draft: { ...draft, state: "ready", provisionedCoworkerId: coworkerRow.id },
                coworker: {
                  id: coworkerRow.id,
                  workspaceId: coworkerRow.workspace_id,
                  handle: coworkerRow.handle,
                  name: coworkerRow.name,
                  title: coworkerRow.title,
                  avatarSeed: null,
                  visibility: "workspace",
                  status: coworkerRow.status as CoworkerRecord["status"],
                  editableConfigJson: asConfig(coworkerRow.editable_config_json),
                  currentVersionId: coworkerRow.current_version_id,
                  configRevision: coworkerRow.config_revision,
                  nativeSubagentsEnabled: false,
                  createdAt: input.createdAt,
                  updatedAt: input.createdAt,
                },
              };
            }
          }
          return { ok: false, reason: "handle_conflict", draft };
        }

        if (draft.state !== "awaiting_review") {
          return { ok: false, reason: "invalid_state", draft };
        }

        if (
          draft.revision !== input.expectedRevision ||
          draft.draftHash !== input.expectedHash ||
          draft.policyRevision !== input.expectedPolicyRevision ||
          draft.catalogRevision !== input.expectedCatalogRevision
        ) {
          return { ok: false, reason: "stale", draft };
        }

        const config: CoworkerEditableConfig = {
          standing_instructions: proposal.standing_instructions,
          model_preset: proposal.model_preset,
          budget: proposal.budget,
          channel_ids: [...proposal.channel_ids],
          task_record_grants: proposal.task_record_grants.map((grant) => ({
            channel_id: grant.channel_id,
            operations: [...grant.operations],
          })),
          tool_grants: [...proposal.tool_grants],
          skill_version_ids: [...proposal.skill_version_ids],
          component_version_ids: [...proposal.component_version_ids],
          sandbox: draft.effectivePreview.sandbox,
        };
        const versionConfig = {
          ...config,
          name: proposal.name,
          handle: proposal.handle,
          title: proposal.title,
          native_subagents_enabled: false,
        };

        await tx`
          INSERT INTO agent_profiles (
            id, workspace_id, handle, name, title, visibility, status,
            editable_config_json, current_version_id, config_revision,
            native_subagents_enabled, created_at, updated_at
          ) VALUES (
            ${input.coworkerId}, ${draft.workspaceId}, ${proposal.handle}, ${proposal.name},
            ${proposal.title}, 'workspace', 'active',
            ${JSON.stringify(config)}::jsonb, ${input.versionId}, 1, false,
            ${input.createdAt}, ${input.createdAt}
          )
        `;
        await tx`
          INSERT INTO agent_versions (
            id, agent_profile_id, version, config_json, spec_hash, created_by, created_at
          ) VALUES (
            ${input.versionId}, ${input.coworkerId}, 1,
            ${JSON.stringify(versionConfig)}::jsonb, ${input.specHash},
            ${input.actorId}, ${input.createdAt}
          )
        `;

        for (const channelId of proposal.channel_ids) {
          await tx`
            INSERT INTO channel_participants (
              channel_id, participant_type, participant_id, role, joined_at, removed_at
            ) VALUES (
              ${channelId}, 'coworker', ${input.coworkerId}, 'member', ${input.createdAt}, NULL
            )
            ON CONFLICT (channel_id, participant_type, participant_id) DO UPDATE SET
              removed_at = NULL,
              joined_at = EXCLUDED.joined_at
          `;
        }

        const updatedRows = await tx<
          Array<{
            id: string;
            workspace_id: string;
            source_text_encrypted: string;
            proposal_json: unknown;
            effective_preview_json: unknown;
            draft_hash: string;
            revision: number;
            policy_revision: number;
            catalog_revision: number;
            state: string;
            created_by: string;
            expires_at: string | Date;
            created_at: string | Date;
            decided_at: string | Date | null;
          }>
        >`
          UPDATE coworker_drafts
          SET state = 'ready', decided_at = ${input.now}
          WHERE id = ${input.draftId}
          RETURNING *
        `;
        const updatedDraft = mapCoworkerDraft(updatedRows[0]!);
        const coworker: CoworkerRecord = {
          id: input.coworkerId,
          workspaceId: draft.workspaceId,
          handle: proposal.handle,
          name: proposal.name,
          title: proposal.title,
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
        return {
          ok: true,
          draft: { ...updatedDraft, provisionedCoworkerId: coworker.id },
          coworker,
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
