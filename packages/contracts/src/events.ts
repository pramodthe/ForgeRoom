import { z } from "zod";
import { p0UiRailSchema, uiInstanceStatusSchema } from "./components";
import { pauseGroupStateSchema } from "./pause";
import { nonNegativeIntSchema, opaqueIdSchema, schemaVersion1, sha256Schema } from "./primitives";
import { runActivityCountersSchema, runLifecycleSchema } from "./runs";
import { channelUIStateV1Schema, threadUIStateV1Schema } from "./state";
import { taskStatusSchema } from "./tasks";
import { isP0UnsupportedCapability, unsupportedCapability } from "./unsupported";

export const applicationSourceNameSchema = z.enum([
  "channel.created",
  "channel.renamed",
  "channel.archived",
  "participant.added",
  "participant.removed",
  "message.created",
  "pin.created",
  "pin.removed",
  "coworker.draft_created",
  "coworker.draft_stale",
  "coworker.created",
  "coworker.provisioning_failed",
  "task.created",
  "task.updated",
  "skill.draft_created",
  "skill.version_published",
  "skill.binding_changed",
  "run.created",
  "run.routing_resolved",
  "run.state_changed",
  "run.completed",
  "run.partial",
  "run.failed",
  "run.cancel_requested",
  "run.cancelled",
  "step.queued",
  "step.started",
  "step.state_changed",
  "step.correction_queued",
  "step.completed",
  "step.failed",
  "tool.proposed",
  "tool.started",
  "tool.succeeded",
  "tool.failed",
  "tool.outcome_unknown",
  "connection.blocked",
  "connection.restored",
  "connector.drifted",
  "pause_group.created",
  "approval.requested",
  "approval.decided",
  "approval.stale",
  "question.requested",
  "question.answered",
  "pause_group.ready",
  "pause_group.resume_started",
  "pause_group.resumed",
  "pause_group.resume_uncertain",
  "sandbox.created",
  "sandbox.command_started",
  "sandbox.command_completed",
  "sandbox.failed",
  "artifact.discovered",
  "artifact.published",
  "artifact.preview_failed",
  "ui.surface.created",
  "ui.render.snapshot",
  "ui.render.patch",
  "ui.state.snapshot",
  "ui.state.patch",
  "ui.surface.ready",
  "ui.surface.degraded",
  "ui.surface.failed",
  "ui.surface.revoked",
  "ui.interaction.accepted",
  "ui.interaction.rejected",
  "ui.interaction.result",
  "ui.surface.closed",
  "session.provisioning",
  "session.ready",
  "session.rotating",
  "session.retired",
  "turn.reconnecting",
  "turn.needs_attention",
]);

export const reservedNativeSubagentSourceSchema = z.enum([
  "subagent.started",
  "subagent.completed",
  "subagent.failed",
]);

export const forgeRoomActivityTypeSchema = z.enum([
  "forgeroom.coworker_work.v1",
  "forgeroom.task_record.v1",
  "forgeroom.sandbox.v1",
  "forgeroom.artifact.v1",
  "forgeroom.pause_group.v1",
  "forgeroom.controlled_ui.v1",
  "forgeroom.connection.v1",
  "forgeroom.audit_receipt.v1",
]);

export const requiredAgUiEventFamilySchema = z.enum([
  "RUN_STARTED",
  "RUN_FINISHED",
  "RUN_ERROR",
  "STEP_STARTED",
  "STEP_FINISHED",
  "TEXT_MESSAGE_START",
  "TEXT_MESSAGE_CONTENT",
  "TEXT_MESSAGE_END",
  "TOOL_CALL_START",
  "TOOL_CALL_ARGS",
  "TOOL_CALL_END",
  "TOOL_CALL_RESULT",
  "MESSAGES_SNAPSHOT",
  "STATE_SNAPSHOT",
  "STATE_DELTA",
  "ACTIVITY_SNAPSHOT",
  "ACTIVITY_DELTA",
  "CUSTOM",
]);

export const jsonPatchOperationSchema = z
  .object({
    op: z.enum(["add", "remove", "replace", "move", "copy", "test"]),
    path: z.string().min(1),
    from: z.string().min(1).optional(),
    value: z.unknown().optional(),
  })
  .strict();

const activityBase = {
  schemaVersion: schemaVersion1,
  activityRevision: nonNegativeIntSchema,
};

export const coworkerWorkActivitySchema = z
  .object({
    ...activityBase,
    activityType: z.literal("forgeroom.coworker_work.v1"),
    coworkerId: opaqueIdSchema,
    logicalThreadId: opaqueIdSchema,
    assignment: z.string().min(1),
    phase: z.enum(["queued", "running", "interrupted", "finished", "failed"]),
  })
  .strict();

export const taskRecordActivitySchema = z
  .object({
    ...activityBase,
    activityType: z.literal("forgeroom.task_record.v1"),
    taskId: opaqueIdSchema,
    revision: z.number().int().positive(),
    status: taskStatusSchema,
    title: z.string().min(1),
  })
  .strict();

export const sandboxActivitySchema = z
  .object({
    ...activityBase,
    activityType: z.literal("forgeroom.sandbox.v1"),
    sandboxId: opaqueIdSchema,
    commandState: z.enum(["creating", "running", "completed", "failed"]),
  })
  .strict();

export const artifactActivitySchema = z
  .object({
    ...activityBase,
    activityType: z.literal("forgeroom.artifact.v1"),
    artifactId: opaqueIdSchema,
    revision: z.number().int().positive(),
    mimeType: z.string().min(1),
    title: z.string().min(1),
  })
  .strict();

export const pauseGroupActivitySchema = z
  .object({
    ...activityBase,
    activityType: z.literal("forgeroom.pause_group.v1"),
    pauseGroupId: opaqueIdSchema,
    state: pauseGroupStateSchema,
    requiredActionCount: nonNegativeIntSchema,
    resolvedActionCount: nonNegativeIntSchema,
  })
  .strict();

export const controlledUiActivitySchema = z
  .object({
    ...activityBase,
    activityType: z.literal("forgeroom.controlled_ui.v1"),
    surfaceId: opaqueIdSchema,
    rail: p0UiRailSchema,
    componentName: z.string().min(1),
    componentVersion: z.string().min(1),
    status: uiInstanceStatusSchema,
    renderRevision: z.number().int().nonnegative().nullable(),
    stateRevision: z.number().int().nonnegative().nullable(),
    textAlternative: z.string().min(1),
  })
  .strict();

export const connectionActivitySchema = z
  .object({
    ...activityBase,
    activityType: z.literal("forgeroom.connection.v1"),
    connectionId: opaqueIdSchema,
    status: z.enum(["unconfigured", "connecting", "active", "expired", "revoked", "drifted"]),
  })
  .strict();

export const auditReceiptActivitySchema = z
  .object({
    ...activityBase,
    activityType: z.literal("forgeroom.audit_receipt.v1"),
    runId: opaqueIdSchema,
    receiptHash: sha256Schema,
  })
  .strict();

export const forgeRoomActivityContentSchema = z.discriminatedUnion("activityType", [
  coworkerWorkActivitySchema,
  taskRecordActivitySchema,
  sandboxActivitySchema,
  artifactActivitySchema,
  pauseGroupActivitySchema,
  controlledUiActivitySchema,
  connectionActivitySchema,
  auditReceiptActivitySchema,
]);

export const activitySnapshotEventSchema = z
  .object({
    type: z.literal("ACTIVITY_SNAPSHOT"),
    messageId: opaqueIdSchema,
    activityType: forgeRoomActivityTypeSchema,
    replace: z.literal(true),
    content: forgeRoomActivityContentSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.content.activityType !== value.activityType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "activityType must match content.activityType",
      });
    }
  });

export const activityDeltaEventSchema = z
  .object({
    type: z.literal("ACTIVITY_DELTA"),
    messageId: opaqueIdSchema,
    activityType: forgeRoomActivityTypeSchema,
    patch: z.array(jsonPatchOperationSchema).min(2),
  })
  .strict()
  .superRefine((value, ctx) => {
    const first = value.patch[0];
    const last = value.patch[value.patch.length - 1];
    if (first?.op !== "test" || first.path !== "/activityRevision") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ACTIVITY_DELTA must begin with test /activityRevision",
      });
    }
    if (last?.op !== "replace" || last.path !== "/activityRevision") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ACTIVITY_DELTA must end by replacing /activityRevision",
      });
    }
  });

export const stateSnapshotEventSchema = z
  .object({
    type: z.literal("STATE_SNAPSHOT"),
    snapshot: z.discriminatedUnion("stateKind", [channelUIStateV1Schema, threadUIStateV1Schema]),
  })
  .strict();

export const stateDeltaEventSchema = z
  .object({
    type: z.literal("STATE_DELTA"),
    stateKind: z.enum(["channel", "thread"]),
    revision: nonNegativeIntSchema,
    patch: z.array(jsonPatchOperationSchema).min(1),
  })
  .strict();

export const customApplicationEventSchema = z
  .object({
    type: z.literal("CUSTOM"),
    name: applicationSourceNameSchema,
    payload: z.object({
      schemaVersion: schemaVersion1,
      lifecycle: runLifecycleSchema.optional(),
      activity: runActivityCountersSchema.optional(),
    }),
  })
  .strict();

export const p0PersistedAguiEventSchema = z.union([
  activitySnapshotEventSchema,
  activityDeltaEventSchema,
  stateSnapshotEventSchema,
  stateDeltaEventSchema,
  customApplicationEventSchema,
]);

export const actorKindSchema = z.enum(["human", "coworker", "native_subagent", "system"]);

export const agentChannelEnvelopeSchema = z
  .object({
    schemaVersion: schemaVersion1,
    channelId: opaqueIdSchema,
    channelSequence: z.number().int().nonnegative(),
    applicationRunId: opaqueIdSchema.optional(),
    runStepId: opaqueIdSchema.optional(),
    agentTurnId: opaqueIdSchema.optional(),
    actorKind: actorKindSchema,
    coworkerId: opaqueIdSchema.optional(),
    logicalThreadId: opaqueIdSchema.optional(),
    nativeSubagentId: opaqueIdSchema.optional(),
    sourceMessageId: opaqueIdSchema.optional(),
    aguiEvent: p0PersistedAguiEventSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.actorKind === "native_subagent" || value.nativeSubagentId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "native subagent envelopes are unsupported in P0",
      });
    }
    if (value.actorKind === "coworker") {
      for (const field of [
        "coworkerId",
        "logicalThreadId",
        "applicationRunId",
        "runStepId",
        "agentTurnId",
      ] as const) {
        if (!value[field]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `coworker envelopes require ${field}`,
            path: [field],
          });
        }
      }
    }
    if (value.actorKind === "system") {
      if (value.coworkerId || value.logicalThreadId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "channel system state must omit coworkerId and logicalThreadId",
        });
      }
    }
  });

export type AgentChannelEnvelope = z.infer<typeof agentChannelEnvelopeSchema>;
export type P0PersistedAguiEvent = z.infer<typeof p0PersistedAguiEventSchema>;

export function parseUpstreamAgUiEvent(input: unknown) {
  const type =
    typeof input === "object" && input !== null && "type" in input && typeof input.type === "string"
      ? input.type
      : "unknown";
  if (isP0UnsupportedCapability(type) || type === "RAW") {
    return unsupportedCapability(type);
  }
  return unsupportedCapability("upstream_ag_ui_schema", "owned_by_P0-211");
}

export function parseUpstreamRunAgentInput(_input: unknown) {
  return unsupportedCapability("RunAgentInput", "owned_by_P0-211");
}
