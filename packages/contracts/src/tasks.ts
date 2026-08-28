import { z } from "zod";
import {
  isoDateTimeSchema,
  nonNegativeIntSchema,
  opaqueIdSchema,
  safeJsonObjectSchema,
  schemaVersion1,
  sha256Schema,
} from "./primitives";

export const taskStatusSchema = z.enum([
  "todo",
  "in_progress",
  "blocked",
  "in_review",
  "done",
  "cancelled",
]);

export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const taskRecordOperationSchema = z.enum(["create", "update_status", "update_fields"]);

function validateAssigneePair(
  value: { assignee_type?: "human" | "coworker" | null; assignee_id?: string | null },
  ctx: z.RefinementCtx,
  requireBothFields: boolean,
) {
  const hasType = Object.prototype.hasOwnProperty.call(value, "assignee_type");
  const hasId = Object.prototype.hasOwnProperty.call(value, "assignee_id");
  if (requireBothFields && hasType !== hasId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "assignee_type and assignee_id must be updated together",
    });
    return;
  }
  if ((value.assignee_type === null) !== (value.assignee_id === null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "assignee_type and assignee_id must both be null or both be set",
    });
  }
}

export const taskRecordV1Schema = z
  .object({
    schemaVersion: schemaVersion1,
    id: opaqueIdSchema,
    workspace_id: opaqueIdSchema,
    channel_id: opaqueIdSchema,
    title: z.string().min(1),
    description: z.string().nullable(),
    status: taskStatusSchema,
    assignee_type: z.enum(["human", "coworker"]).nullable(),
    assignee_id: opaqueIdSchema.nullable(),
    source_message_id: opaqueIdSchema.nullable(),
    source_run_id: opaqueIdSchema.nullable(),
    due_at: isoDateTimeSchema.nullable(),
    current_revision: z.number().int().positive(),
    created_by_type: z.enum(["human", "coworker"]),
    created_by_id: opaqueIdSchema,
    created_at: isoDateTimeSchema,
    updated_at: isoDateTimeSchema,
  })
  .strict()
  .superRefine((value, ctx) => validateAssigneePair(value, ctx, false));

export const taskRevisionSchema = z
  .object({
    schemaVersion: schemaVersion1,
    id: opaqueIdSchema,
    task_id: opaqueIdSchema,
    revision: z.number().int().positive(),
    data: safeJsonObjectSchema,
    data_hash: sha256Schema,
    changed_fields: z.array(z.string().min(1)),
    actor_type: z.enum(["human", "coworker"]),
    actor_id: opaqueIdSchema,
    command_id: opaqueIdSchema,
    created_at: isoDateTimeSchema,
  })
  .strict();

export const taskGrantSchema = z
  .object({
    schemaVersion: schemaVersion1,
    id: opaqueIdSchema,
    task_id: opaqueIdSchema.nullable(),
    channel_id: opaqueIdSchema,
    subject_type: z.enum(["human", "coworker"]),
    subject_id: opaqueIdSchema,
    allowed_operations: z.array(taskRecordOperationSchema).min(1),
    allowed_fields: z.array(z.string().min(1)),
    allowed_transitions: z.array(
      z
        .object({
          from: taskStatusSchema,
          to: taskStatusSchema,
        })
        .strict(),
    ),
    policy_revision: nonNegativeIntSchema,
    granted_by: opaqueIdSchema,
    created_at: isoDateTimeSchema,
    revoked_at: isoDateTimeSchema.nullable(),
  })
  .strict();

export const taskUpdateCommandSchema = z
  .object({
    schemaVersion: schemaVersion1,
    expected_revision: z.number().int().positive(),
    idempotency_key: z.string().min(1),
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    status: taskStatusSchema.optional(),
    assignee_type: z.enum(["human", "coworker"]).nullable().optional(),
    assignee_id: opaqueIdSchema.nullable().optional(),
    due_at: isoDateTimeSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const mutableFields = [
      "title",
      "description",
      "status",
      "assignee_type",
      "assignee_id",
      "due_at",
    ] as const;
    if (!mutableFields.some((field) => Object.prototype.hasOwnProperty.call(value, field))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "task update must include at least one mutable field",
      });
    }
    validateAssigneePair(value, ctx, true);
  });

export const taskCreateCommandSchema = z
  .object({
    schemaVersion: schemaVersion1,
    title: z.string().min(1),
    description: z.string().nullable(),
    status: taskStatusSchema.default("todo"),
    assignee_type: z.enum(["human", "coworker"]).nullable(),
    assignee_id: opaqueIdSchema.nullable(),
    source_message_id: opaqueIdSchema.nullable(),
    source_run_id: opaqueIdSchema.nullable(),
    due_at: isoDateTimeSchema.nullable(),
    idempotency_key: z.string().min(1),
  })
  .strict()
  .superRefine((value, ctx) => validateAssigneePair(value, ctx, false));

export type TaskRecordV1 = z.infer<typeof taskRecordV1Schema>;
export type TaskRevision = z.infer<typeof taskRevisionSchema>;
export type TaskGrant = z.infer<typeof taskGrantSchema>;
export type TaskRecordOperation = z.infer<typeof taskRecordOperationSchema>;
export type TaskCreateCommand = z.infer<typeof taskCreateCommandSchema>;
export type TaskUpdateCommand = z.infer<typeof taskUpdateCommandSchema>;
