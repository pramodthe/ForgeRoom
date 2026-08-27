import { z } from "zod";
import {
  p0AgentToolComponentNameSchema,
  p0UiRailSchema,
  uiInstanceStatusSchema,
} from "./components";
import { connectionStatusSchema } from "./connections";
import { pauseGroupStateSchema } from "./pause";
import {
  nonNegativeIntSchema,
  opaqueIdSchema,
  isUnsafeObjectKey,
  safeJsonValueSchema,
  schemaVersion1,
  sha256Schema,
} from "./primitives";
import { runActivityCountersSchema, runLifecycleSchema } from "./runs";
import { messageCreatedRoutingPayloadSchema } from "./routing";
import {
  channelArtifactProjectionSchema,
  channelCoworkerProjectionSchema,
  channelRunProjectionSchema,
  channelTaskProjectionSchema,
  channelUiInstanceProjectionSchema,
  channelUIStateV1Schema,
  pendingHumanActionProjectionSchema,
  threadPhaseSchema,
  threadUIStateV1Schema,
} from "./state";
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

const jsonPointerSchema = z
  .string()
  .refine((value) => /^(?:\/(?:[^~/]|~0|~1)*)*$/u.test(value), "must be an RFC 6901 JSON Pointer")
  .refine(
    (value) => parseJsonPointer(value).every((segment) => !isUnsafeObjectKey(segment)),
    "prototype-mutating JSON Pointer segments are forbidden",
  );

const jsonPatchAddOperationSchema = z
  .object({
    op: z.literal("add"),
    path: jsonPointerSchema,
    value: safeJsonValueSchema,
  })
  .strict();

const jsonPatchRemoveOperationSchema = z
  .object({
    op: z.literal("remove"),
    path: jsonPointerSchema,
  })
  .strict();

const jsonPatchReplaceOperationSchema = z
  .object({
    op: z.literal("replace"),
    path: jsonPointerSchema,
    value: safeJsonValueSchema,
  })
  .strict();

const jsonPatchMoveOperationSchema = z
  .object({
    op: z.literal("move"),
    path: jsonPointerSchema,
    from: jsonPointerSchema,
  })
  .strict();

const jsonPatchCopyOperationSchema = z
  .object({
    op: z.literal("copy"),
    path: jsonPointerSchema,
    from: jsonPointerSchema,
  })
  .strict();

const jsonPatchTestOperationSchema = z
  .object({
    op: z.literal("test"),
    path: jsonPointerSchema,
    value: safeJsonValueSchema,
  })
  .strict();

export const jsonPatchOperationSchema = z.discriminatedUnion("op", [
  jsonPatchAddOperationSchema,
  jsonPatchRemoveOperationSchema,
  jsonPatchReplaceOperationSchema,
  jsonPatchMoveOperationSchema,
  jsonPatchCopyOperationSchema,
  jsonPatchTestOperationSchema,
]);

type JsonPatchOperation = z.infer<typeof jsonPatchOperationSchema>;

function parseJsonPointer(path: string): string[] {
  if (path === "") {
    return [];
  }
  return path
    .slice(1)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function isRevisionValue(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isAllowedActivityPath(
  activityType: z.infer<typeof forgeRoomActivityTypeSchema>,
  path: string,
) {
  const segments = parseJsonPointer(path);
  if (segments.length !== 1) {
    return false;
  }

  const allowedFields: Record<z.infer<typeof forgeRoomActivityTypeSchema>, readonly string[]> = {
    "forgeroom.coworker_work.v1": ["assignment", "phase"],
    "forgeroom.task_record.v1": ["revision", "status", "title"],
    "forgeroom.sandbox.v1": ["commandState"],
    "forgeroom.artifact.v1": ["revision", "mimeType", "title"],
    "forgeroom.pause_group.v1": ["state", "requiredActionCount", "resolvedActionCount"],
    "forgeroom.controlled_ui.v1": ["status", "renderRevision", "stateRevision", "textAlternative"],
    "forgeroom.connection.v1": ["status"],
    "forgeroom.audit_receipt.v1": ["receiptHash"],
  };
  return allowedFields[activityType].includes(segments[0] ?? "");
}

const runCounterFields = new Set([
  "planning",
  "running",
  "awaiting_input",
  "awaiting_approval",
  "blocked_connection",
  "cancelling",
  "queued",
]);

function isArrayIndex(segment: string, operation: JsonPatchOperation["op"]): boolean {
  if (segment === "-") {
    return operation === "add";
  }
  return /^(?:0|[1-9][0-9]*)$/u.test(segment);
}

function isRequiredFieldOperation(operation: JsonPatchOperation): boolean {
  return operation.op === "replace" || operation.op === "test";
}

function isOptionalOrEntryOperation(operation: JsonPatchOperation): boolean {
  return (
    operation.op === "add" ||
    operation.op === "remove" ||
    operation.op === "replace" ||
    operation.op === "test"
  );
}

function isAllowedChannelStatePath(operation: JsonPatchOperation): boolean {
  const segments = parseJsonPointer(operation.path);
  const [root, recordId, field, child] = segments;

  if (root === "channel") {
    return (
      segments.length === 2 &&
      (recordId === "name" || recordId === "archived") &&
      isRequiredFieldOperation(operation)
    );
  }
  if (root === "coworkers" && recordId) {
    if (segments.length === 2) return isOptionalOrEntryOperation(operation);
    if (segments.length === 3 && field === "currentAssignment") {
      return isOptionalOrEntryOperation(operation);
    }
    if (segments.length === 3 && (field === "availability" || field === "activeRunStepIds")) {
      return isRequiredFieldOperation(operation);
    }
    return (
      segments.length === 4 &&
      field === "activeRunStepIds" &&
      child !== undefined &&
      isArrayIndex(child, operation.op) &&
      isOptionalOrEntryOperation(operation)
    );
  }
  if (root === "runs" && recordId) {
    if (segments.length === 2) return isOptionalOrEntryOperation(operation);
    if (segments.length === 3 && (field === "lifecycle" || field === "counters")) {
      return isRequiredFieldOperation(operation);
    }
    return (
      segments.length === 4 &&
      field === "counters" &&
      child !== undefined &&
      runCounterFields.has(child) &&
      isRequiredFieldOperation(operation)
    );
  }
  if (root === "artifacts" && recordId) {
    if (segments.length === 2) return isOptionalOrEntryOperation(operation);
    return (
      segments.length === 3 &&
      ["revision", "mimeType", "title"].includes(field ?? "") &&
      isRequiredFieldOperation(operation)
    );
  }
  if (root === "tasks" && recordId) {
    if (segments.length === 2) return isOptionalOrEntryOperation(operation);
    if (segments.length === 3 && field === "assigneeId") {
      return isOptionalOrEntryOperation(operation);
    }
    return (
      segments.length === 3 &&
      ["revision", "status", "title"].includes(field ?? "") &&
      isRequiredFieldOperation(operation)
    );
  }
  if (root === "uiInstances" && recordId) {
    if (segments.length === 2) return isOptionalOrEntryOperation(operation);
    return (
      segments.length === 3 &&
      [
        "rail",
        "componentName",
        "componentVersion",
        "status",
        "renderRevision",
        "stateRevision",
      ].includes(field ?? "") &&
      isRequiredFieldOperation(operation)
    );
  }
  if (root === "pendingHumanActions") {
    if (segments.length === 1) return isRequiredFieldOperation(operation);
    return (
      segments.length === 2 &&
      recordId !== undefined &&
      isArrayIndex(recordId, operation.op) &&
      isOptionalOrEntryOperation(operation)
    );
  }
  return false;
}

function isAllowedThreadStatePath(operation: JsonPatchOperation): boolean {
  const segments = parseJsonPointer(operation.path);
  const [root, index] = segments;
  if (segments.length === 1 && root === "phase") {
    return isRequiredFieldOperation(operation);
  }
  if (segments.length === 1 && root === "activeAguiRunId") {
    return isOptionalOrEntryOperation(operation);
  }
  if (root !== "activeRunStepIds" && root !== "surfaceIds") {
    return false;
  }
  if (segments.length === 1) {
    return isRequiredFieldOperation(operation);
  }
  return (
    segments.length === 2 &&
    index !== undefined &&
    isArrayIndex(index, operation.op) &&
    isOptionalOrEntryOperation(operation)
  );
}

function validateRevisionPatch(
  patch: JsonPatchOperation[],
  expectedRevision: number | undefined,
  revisionPath: "/activityRevision" | "/revision",
  ctx: z.RefinementCtx,
) {
  const first = patch[0];
  const last = patch[patch.length - 1];
  const baseRevision =
    first?.op === "test" && first.path === revisionPath && isRevisionValue(first.value)
      ? first.value
      : undefined;

  if (
    baseRevision === undefined ||
    (expectedRevision !== undefined && baseRevision !== expectedRevision)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `patch must begin with an exact numeric test of ${revisionPath}`,
      path: ["patch", 0],
    });
  }

  const nextRevision =
    last?.op === "replace" && last.path === revisionPath && isRevisionValue(last.value)
      ? last.value
      : undefined;
  if (baseRevision === undefined || nextRevision !== baseRevision + 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `patch must end by replacing ${revisionPath} with the next integer`,
      path: ["patch", Math.max(0, patch.length - 1)],
    });
  }

  return { baseRevision, nextRevision };
}

const activityBase = {
  schemaVersion: schemaVersion1,
  activityRevision: nonNegativeIntSchema,
};

const coworkerWorkPhaseSchema = z.enum(["queued", "running", "interrupted", "finished", "failed"]);
const sandboxCommandStateSchema = z.enum(["creating", "running", "completed", "failed"]);

const pauseGroupActivityInvariantBaseSchema = z
  .object({
    state: pauseGroupStateSchema,
    requiredActionCount: z.number().int().positive(),
    resolvedActionCount: nonNegativeIntSchema,
  })
  .strict();

function validatePauseGroupActivityInvariant(
  value: z.infer<typeof pauseGroupActivityInvariantBaseSchema>,
  ctx: z.RefinementCtx,
): void {
  if (value.resolvedActionCount > value.requiredActionCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "resolvedActionCount cannot exceed requiredActionCount",
      path: ["resolvedActionCount"],
    });
  }
  const complete = value.resolvedActionCount === value.requiredActionCount;
  if (value.state === "collecting" && complete) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "a complete PauseGroup cannot remain collecting",
      path: ["state"],
    });
  }
  if (["ready", "resuming", "resumed", "uncertain"].includes(value.state) && !complete) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${value.state} requires every RequiredAction to resolve`,
      path: ["state"],
    });
  }
}

const pauseGroupActivityInvariantSchema = pauseGroupActivityInvariantBaseSchema.superRefine(
  validatePauseGroupActivityInvariant,
);

const controlledUiActivityInvariantBaseSchema = z
  .object({
    status: uiInstanceStatusSchema,
    renderRevision: z.number().int().nonnegative().nullable(),
    stateRevision: z.number().int().nonnegative().nullable(),
  })
  .strict();

function validateControlledUiActivityInvariant(
  value: z.infer<typeof controlledUiActivityInvariantBaseSchema>,
  ctx: z.RefinementCtx,
): void {
  if (
    value.status === "building" &&
    (value.renderRevision !== null || value.stateRevision !== null)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "building UI activities cannot carry committed revisions",
    });
  }
  if (value.status === "ready" && value.renderRevision === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "ready UI activities require a committed render revision",
      path: ["renderRevision"],
    });
  }
}

const controlledUiActivityInvariantSchema = controlledUiActivityInvariantBaseSchema.superRefine(
  validateControlledUiActivityInvariant,
);

export const coworkerWorkActivitySchema = z
  .object({
    ...activityBase,
    activityType: z.literal("forgeroom.coworker_work.v1"),
    coworkerId: opaqueIdSchema,
    logicalThreadId: opaqueIdSchema,
    assignment: z.string().min(1),
    phase: coworkerWorkPhaseSchema,
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
    commandState: sandboxCommandStateSchema,
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
    ...pauseGroupActivityInvariantBaseSchema.shape,
  })
  .strict()
  .superRefine(validatePauseGroupActivityInvariant);

export const controlledUiActivitySchema = z
  .object({
    ...activityBase,
    activityType: z.literal("forgeroom.controlled_ui.v1"),
    surfaceId: opaqueIdSchema,
    rail: p0UiRailSchema,
    componentName: p0AgentToolComponentNameSchema,
    componentVersion: z.string().min(1),
    ...controlledUiActivityInvariantBaseSchema.shape,
    textAlternative: z.string().min(1),
  })
  .strict()
  .superRefine(validateControlledUiActivityInvariant);

export const connectionActivitySchema = z
  .object({
    ...activityBase,
    activityType: z.literal("forgeroom.connection.v1"),
    connectionId: opaqueIdSchema,
    status: connectionStatusSchema,
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

function activityPatchValueSchema(
  activityType: z.infer<typeof forgeRoomActivityTypeSchema>,
  path: string,
): z.ZodTypeAny | undefined {
  const field = parseJsonPointer(path)[0];
  const schemas: Record<
    z.infer<typeof forgeRoomActivityTypeSchema>,
    Record<string, z.ZodTypeAny>
  > = {
    "forgeroom.coworker_work.v1": {
      assignment: z.string().min(1),
      phase: coworkerWorkPhaseSchema,
    },
    "forgeroom.task_record.v1": {
      revision: z.number().int().positive(),
      status: taskStatusSchema,
      title: z.string().min(1),
    },
    "forgeroom.sandbox.v1": { commandState: sandboxCommandStateSchema },
    "forgeroom.artifact.v1": {
      revision: z.number().int().positive(),
      mimeType: z.string().min(1),
      title: z.string().min(1),
    },
    "forgeroom.pause_group.v1": {
      state: pauseGroupStateSchema,
      requiredActionCount: z.number().int().positive(),
      resolvedActionCount: nonNegativeIntSchema,
    },
    "forgeroom.controlled_ui.v1": {
      status: uiInstanceStatusSchema,
      renderRevision: nonNegativeIntSchema.nullable(),
      stateRevision: nonNegativeIntSchema.nullable(),
      textAlternative: z.string().min(1),
    },
    "forgeroom.connection.v1": { status: connectionStatusSchema },
    "forgeroom.audit_receipt.v1": { receiptHash: sha256Schema },
  };
  return field === undefined ? undefined : schemas[activityType][field];
}

function channelStatePatchValueSchema(path: string): z.ZodTypeAny | undefined {
  const [root, recordId, field, child] = parseJsonPointer(path);
  if (root === "channel") {
    if (recordId !== undefined && field === undefined) {
      return recordId === "name"
        ? z.string().min(1)
        : recordId === "archived"
          ? z.boolean()
          : undefined;
    }
  }
  if (root === "coworkers") {
    if (field === undefined) return channelCoworkerProjectionSchema;
    if (field === "availability" || field === "currentAssignment") return z.string().min(1);
    if (field === "activeRunStepIds") {
      return child === undefined ? z.array(opaqueIdSchema) : opaqueIdSchema;
    }
  }
  if (root === "runs") {
    if (field === undefined) return channelRunProjectionSchema;
    if (field === "lifecycle") return runLifecycleSchema;
    if (field === "counters") {
      return child === undefined ? runActivityCountersSchema : nonNegativeIntSchema;
    }
  }
  if (root === "artifacts") {
    if (field === undefined) return channelArtifactProjectionSchema;
    if (field === "revision") return z.number().int().positive();
    if (field === "mimeType" || field === "title") return z.string().min(1);
  }
  if (root === "tasks") {
    if (field === undefined) return channelTaskProjectionSchema;
    if (field === "revision") return z.number().int().positive();
    if (field === "status") return taskStatusSchema;
    if (field === "title") return z.string().min(1);
    if (field === "assigneeId") return opaqueIdSchema;
  }
  if (root === "uiInstances") {
    if (field === undefined) return channelUiInstanceProjectionSchema;
    const uiFieldSchemas: Record<string, z.ZodTypeAny> = {
      rail: p0UiRailSchema,
      componentName: p0AgentToolComponentNameSchema,
      componentVersion: z.string().min(1),
      status: uiInstanceStatusSchema,
      renderRevision: nonNegativeIntSchema.nullable(),
      stateRevision: nonNegativeIntSchema.nullable(),
    };
    return uiFieldSchemas[field];
  }
  if (root === "pendingHumanActions") {
    return recordId === undefined
      ? z.array(pendingHumanActionProjectionSchema)
      : pendingHumanActionProjectionSchema;
  }
  return undefined;
}

function threadStatePatchValueSchema(path: string): z.ZodTypeAny | undefined {
  const [root, index] = parseJsonPointer(path);
  if (root === "phase") return threadPhaseSchema;
  if (root === "activeAguiRunId") return opaqueIdSchema;
  if (root === "activeRunStepIds" || root === "surfaceIds") {
    return index === undefined ? z.array(opaqueIdSchema) : opaqueIdSchema;
  }
  return undefined;
}

function validateOperationValue(
  operation: JsonPatchOperation,
  schema: z.ZodTypeAny | undefined,
  index: number,
  ctx: z.RefinementCtx,
): void {
  if (operation.op === "remove") return;
  if (
    schema === undefined ||
    !("value" in operation) ||
    !schema.safeParse(operation.value).success
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "patch value does not preserve the registered field schema",
      path: ["patch", index, "value"],
    });
  }
}

type CorrelatedPatchField = {
  key: string;
  path: string;
  schema: z.ZodTypeAny;
};

function validateCorrelatedPatchInvariant(
  patch: JsonPatchOperation[],
  fields: readonly CorrelatedPatchField[],
  invariantSchema: z.ZodTypeAny,
  invariantName: string,
  ctx: z.RefinementCtx,
): void {
  const fieldsByPath = new Map(fields.map((field) => [field.path, field]));
  const interior = patch.slice(1, -1).map((operation, offset) => ({
    index: offset + 1,
    operation,
  }));
  const replacements = interior.filter(
    ({ operation }) => operation.op === "replace" && fieldsByPath.has(operation.path),
  );
  if (replacements.length === 0) return;

  const firstReplacementIndex = replacements[0]?.index ?? patch.length;
  const finalValue: Record<string, unknown> = {};
  let hasCompletePrecondition = true;

  for (const field of fields) {
    const tests = interior.filter(
      ({ operation }) => operation.op === "test" && operation.path === field.path,
    );
    const test = tests[0];
    if (tests.length !== 1 || !test || test.index >= firstReplacementIndex) {
      hasCompletePrecondition = false;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${invariantName} updates must test ${field.path} exactly once before replacing any coupled field`,
        path: ["patch", Math.min(firstReplacementIndex, patch.length - 1)],
      });
      continue;
    }

    if (!("value" in test.operation)) {
      hasCompletePrecondition = false;
      continue;
    }
    const parsed = field.schema.safeParse(test.operation.value);
    if (!parsed.success) {
      hasCompletePrecondition = false;
      continue;
    }
    finalValue[field.key] = parsed.data;
  }

  if (!hasCompletePrecondition) return;

  const baseResult = invariantSchema.safeParse(finalValue);
  if (!baseResult.success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${invariantName} tests must describe a valid base state: ${baseResult.error.issues[0]?.message ?? "invalid precondition"}`,
      path: ["patch", firstReplacementIndex],
    });
    return;
  }

  for (const { operation } of replacements) {
    const field = fieldsByPath.get(operation.path);
    if (field && "value" in operation) {
      finalValue[field.key] = operation.value;
    }
  }

  const result = invariantSchema.safeParse(finalValue);
  if (!result.success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `patch would violate ${invariantName}: ${result.error.issues[0]?.message ?? "invalid transition"}`,
      path: ["patch", firstReplacementIndex],
    });
  }
}

function validateActivityPatchInvariants(
  activityType: z.infer<typeof forgeRoomActivityTypeSchema>,
  patch: JsonPatchOperation[],
  ctx: z.RefinementCtx,
): void {
  if (activityType === "forgeroom.pause_group.v1") {
    validateCorrelatedPatchInvariant(
      patch,
      [
        { key: "state", path: "/state", schema: pauseGroupStateSchema },
        {
          key: "requiredActionCount",
          path: "/requiredActionCount",
          schema: z.number().int().positive(),
        },
        {
          key: "resolvedActionCount",
          path: "/resolvedActionCount",
          schema: nonNegativeIntSchema,
        },
      ],
      pauseGroupActivityInvariantSchema,
      "PauseGroup activity invariants",
      ctx,
    );
  }

  if (activityType === "forgeroom.controlled_ui.v1") {
    validateCorrelatedPatchInvariant(
      patch,
      [
        { key: "status", path: "/status", schema: uiInstanceStatusSchema },
        {
          key: "renderRevision",
          path: "/renderRevision",
          schema: nonNegativeIntSchema.nullable(),
        },
        {
          key: "stateRevision",
          path: "/stateRevision",
          schema: nonNegativeIntSchema.nullable(),
        },
      ],
      controlledUiActivityInvariantSchema,
      "controlled UI activity invariants",
      ctx,
    );
  }
}

function escapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

function validateChannelUiInstancePatchInvariants(
  patch: JsonPatchOperation[],
  ctx: z.RefinementCtx,
): void {
  const coupledFields = new Set(["status", "renderRevision", "stateRevision"]);
  const changedInstanceIds = new Set<string>();

  for (const operation of patch.slice(1, -1)) {
    const [root, recordId, field] = parseJsonPointer(operation.path);
    if (
      operation.op === "replace" &&
      root === "uiInstances" &&
      recordId &&
      field &&
      coupledFields.has(field)
    ) {
      changedInstanceIds.add(recordId);
    }
  }

  for (const recordId of changedInstanceIds) {
    const recordPath = `/uiInstances/${escapeJsonPointerSegment(recordId)}`;
    validateCorrelatedPatchInvariant(
      patch,
      [
        { key: "status", path: `${recordPath}/status`, schema: uiInstanceStatusSchema },
        {
          key: "renderRevision",
          path: `${recordPath}/renderRevision`,
          schema: nonNegativeIntSchema.nullable(),
        },
        {
          key: "stateRevision",
          path: `${recordPath}/stateRevision`,
          schema: nonNegativeIntSchema.nullable(),
        },
      ],
      controlledUiActivityInvariantSchema,
      `controlled UI projection ${recordId} invariants`,
      ctx,
    );
  }
}

export const forgeRoomActivityContentSchema = z.union([
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
    validateRevisionPatch(value.patch, undefined, "/activityRevision", ctx);

    for (let index = 1; index < value.patch.length - 1; index += 1) {
      const operation = value.patch[index];
      if (!operation) continue;
      if (operation.path === "/activityRevision") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "activityRevision may only be changed by the final increment",
          path: ["patch", index, "path"],
        });
        continue;
      }
      if (operation.op !== "replace" && operation.op !== "test") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "activity deltas support only test and replace operations",
          path: ["patch", index, "op"],
        });
      }
      if (!isAllowedActivityPath(value.activityType, operation.path)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `path is immutable or unsupported for ${value.activityType}`,
          path: ["patch", index, "path"],
        });
      } else {
        validateOperationValue(
          operation,
          activityPatchValueSchema(value.activityType, operation.path),
          index,
          ctx,
        );
      }
    }

    validateActivityPatchInvariants(value.activityType, value.patch, ctx);
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
    patch: z.array(jsonPatchOperationSchema).min(2),
  })
  .strict()
  .superRefine((value, ctx) => {
    validateRevisionPatch(value.patch, value.revision, "/revision", ctx);

    for (let index = 1; index < value.patch.length - 1; index += 1) {
      const operation = value.patch[index];
      if (!operation) continue;
      if (operation.path === "/revision") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "revision may only be changed by the final increment",
          path: ["patch", index, "path"],
        });
        continue;
      }
      if (operation.op === "move" || operation.op === "copy") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "state deltas do not permit move or copy operations",
          path: ["patch", index, "op"],
        });
        continue;
      }
      const pathAllowed =
        value.stateKind === "channel"
          ? isAllowedChannelStatePath(operation)
          : isAllowedThreadStatePath(operation);
      if (!pathAllowed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `path is immutable or outside the ${value.stateKind} state allowlist`,
          path: ["patch", index, "path"],
        });
      } else {
        const schema =
          value.stateKind === "channel"
            ? channelStatePatchValueSchema(operation.path)
            : threadStatePatchValueSchema(operation.path);
        validateOperationValue(operation, schema, index, ctx);
      }
    }

    if (value.stateKind === "channel") {
      validateChannelUiInstancePatchInvariants(value.patch, ctx);
    }
  });

export const customApplicationEventSchema = z
  .object({
    type: z.literal("CUSTOM"),
    name: applicationSourceNameSchema,
    payload: z
      .object({
        schemaVersion: schemaVersion1,
        lifecycle: runLifecycleSchema.optional(),
        activity: runActivityCountersSchema.optional(),
        pin_id: opaqueIdSchema.optional(),
        routing_mode: z.enum(["direct", "team"]).optional(),
        recipient_handles: z.array(z.string().min(1)).min(1).max(2).optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.name === "message.created") {
      const parsed = messageCreatedRoutingPayloadSchema.safeParse(value.payload);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          ctx.addIssue({ ...issue, path: ["payload", ...issue.path] });
        }
      }
      return;
    }
    if (value.payload.routing_mode !== undefined || value.payload.recipient_handles !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "routing fields are only permitted on message.created events",
        path: ["payload"],
      });
    }
  });

export const persistedRunStartedEventSchema = z
  .object({
    type: z.literal("RUN_STARTED"),
    threadId: opaqueIdSchema,
    runId: opaqueIdSchema,
  })
  .strict();

const persistedInterruptSchema = z
  .object({
    id: opaqueIdSchema,
    reason: z.string().min(1).max(128),
    message: z.string().min(1).max(1_000).optional(),
  })
  .strict();

export const persistedRunFinishedEventSchema = z
  .object({
    type: z.literal("RUN_FINISHED"),
    threadId: opaqueIdSchema,
    runId: opaqueIdSchema,
    outcome: z.discriminatedUnion("type", [
      z.object({ type: z.literal("success") }).strict(),
      z
        .object({
          type: z.literal("interrupt"),
          interrupts: z.array(persistedInterruptSchema).min(1).max(20),
        })
        .strict(),
    ]),
  })
  .strict();

export const persistedRunErrorEventSchema = z
  .object({
    type: z.literal("RUN_ERROR"),
    threadId: opaqueIdSchema,
    runId: opaqueIdSchema,
    message: z.string().min(1).max(1_000),
    code: z.string().min(1).max(128).optional(),
  })
  .strict();

export const persistedTextMessageStartEventSchema = z
  .object({
    type: z.literal("TEXT_MESSAGE_START"),
    messageId: opaqueIdSchema,
    role: z.literal("assistant"),
    name: z.string().min(1).max(128).optional(),
  })
  .strict();

export const persistedTextMessageContentEventSchema = z
  .object({
    type: z.literal("TEXT_MESSAGE_CONTENT"),
    messageId: opaqueIdSchema,
    delta: z.string().min(1).max(64_000),
  })
  .strict();

export const persistedTextMessageEndEventSchema = z
  .object({
    type: z.literal("TEXT_MESSAGE_END"),
    messageId: opaqueIdSchema,
  })
  .strict();

export const p0PersistedAguiEventSchema = z.union([
  persistedRunStartedEventSchema,
  persistedRunFinishedEventSchema,
  persistedRunErrorEventSchema,
  persistedTextMessageStartEventSchema,
  persistedTextMessageContentEventSchema,
  persistedTextMessageEndEventSchema,
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
    if (value.actorKind === "human" && (value.coworkerId || value.logicalThreadId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "channel-owned human events must omit coworkerId and logicalThreadId",
      });
    }
    if (value.actorKind === "system") {
      if (value.coworkerId || value.logicalThreadId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "channel system state must omit coworkerId and logicalThreadId",
        });
      }
    }

    if (value.aguiEvent.type === "STATE_SNAPSHOT") {
      const { snapshot } = value.aguiEvent;
      if (snapshot.stateKind === "channel") {
        if (value.actorKind !== "system") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "channel state may only be emitted by the system authority lane",
            path: ["actorKind"],
          });
        }
        if (snapshot.channel.id !== value.channelId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "channel snapshot identity must match the envelope channelId",
            path: ["aguiEvent", "snapshot", "channel", "id"],
          });
        }
      } else {
        if (value.actorKind !== "coworker") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "thread state may only be emitted by its persistent coworker lane",
            path: ["actorKind"],
          });
        }
        if (
          value.coworkerId !== snapshot.coworkerId ||
          value.logicalThreadId !== snapshot.logicalThreadId
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "thread snapshot identity must match the envelope coworker and logical thread",
            path: ["aguiEvent", "snapshot"],
          });
        }
      }
    }

    if (value.aguiEvent.type === "STATE_DELTA") {
      const requiredActor = value.aguiEvent.stateKind === "channel" ? "system" : "coworker";
      if (value.actorKind !== requiredActor) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${value.aguiEvent.stateKind} state deltas require the ${requiredActor} authority lane`,
          path: ["actorKind"],
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
