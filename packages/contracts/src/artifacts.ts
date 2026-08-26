import { z } from "zod";
import {
  isoDateTimeSchema,
  nonNegativeIntSchema,
  opaqueIdSchema,
  safeJsonValueSchema,
  safeRecordSchema,
  schemaVersion1,
  sha256Schema,
} from "./primitives";

export const artifactSchema = z
  .object({
    schemaVersion: schemaVersion1,
    id: opaqueIdSchema,
    workspace_id: opaqueIdSchema,
    channel_id: opaqueIdSchema,
    run_id: opaqueIdSchema,
    run_step_id: opaqueIdSchema,
    creator_coworker_id: opaqueIdSchema,
    kind: z.enum(["file", "preview"]),
    name: z.string().min(1),
    mime_type: z.string().min(1),
    byte_size: nonNegativeIntSchema,
    sha256: sha256Schema,
    revision: z.number().int().positive(),
    created_at: isoDateTimeSchema,
  })
  .strict();

export const auditReceiptSchema = z
  .object({
    schemaVersion: schemaVersion1,
    run_id: opaqueIdSchema,
    channel_id: opaqueIdSchema,
    source_message_id: opaqueIdSchema,
    coworker_ids: z.array(opaqueIdSchema).min(1),
    task_id: opaqueIdSchema.nullable(),
    ui_instance_id: opaqueIdSchema.nullable(),
    artifact_id: opaqueIdSchema.nullable(),
    skill_version_id: opaqueIdSchema.nullable(),
    approval_ids: z.array(opaqueIdSchema),
    hashes: safeRecordSchema(sha256Schema),
    lineage: safeJsonValueSchema,
    created_at: isoDateTimeSchema,
  })
  .strict();

export type Artifact = z.infer<typeof artifactSchema>;
export type AuditReceipt = z.infer<typeof auditReceiptSchema>;
