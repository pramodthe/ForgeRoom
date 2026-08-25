import { z } from "zod";
import {
  isoDateTimeSchema,
  nonNegativeIntSchema,
  opaqueIdSchema,
  safeJsonValueSchema,
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
  .strict();

export const taskRevisionSchema = z
  .object({
    schemaVersion: schemaVersion1,
    id: opaqueIdSchema,
    task_id: opaqueIdSchema,
    revision: z.number().int().positive(),
    data: z.record(z.string(), safeJsonValueSchema),
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
    allowed_operations: z.array(z.enum(["create", "update_status", "update_fields"])).min(1),
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
    expected_revision: z.number().int().positive(),
    idempotency_key: z.string().min(1),
    title: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    status: taskStatusSchema.optional(),
    assignee_type: z.enum(["human", "coworker"]).nullable().optional(),
    assignee_id: opaqueIdSchema.nullable().optional(),
    due_at: isoDateTimeSchema.nullable().optional(),
  })
  .strict();

export type TaskRecordV1 = z.infer<typeof taskRecordV1Schema>;
export type TaskRevision = z.infer<typeof taskRevisionSchema>;
export type TaskGrant = z.infer<typeof taskGrantSchema>;
