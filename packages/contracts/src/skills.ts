import { z } from "zod";
import { isoDateTimeSchema, opaqueIdSchema, schemaVersion1, sha256Schema } from "./primitives";

export const skillDraftStateSchema = z.enum(["draft", "published"]);
export const skillBindingStateSchema = z.enum(["active", "detached", "blocked"]);

export const skillDraftSchema = z
  .object({
    schemaVersion: schemaVersion1,
    id: opaqueIdSchema,
    workspace_id: opaqueIdSchema,
    source_run_id: opaqueIdSchema,
    source_step_ids: z.array(opaqueIdSchema).min(1),
    source_content_hash: sha256Schema,
    when_to_use: z.string().min(1),
    inputs: z.array(z.string().min(1)),
    method: z.array(z.string().min(1)).min(1),
    validation: z.string().min(1),
    output: z.string().min(1),
    failures: z.array(z.string()),
    required_tools: z.array(z.string().min(1)),
    required_components: z.array(opaqueIdSchema),
    required_approvals: z.array(z.string().min(1)),
    state: z.literal("draft"),
    created_by: opaqueIdSchema,
    created_at: isoDateTimeSchema,
  })
  .strict();

export const skillVersionSchema = z
  .object({
    schemaVersion: schemaVersion1,
    id: opaqueIdSchema,
    skill_id: opaqueIdSchema,
    version: z.literal(1),
    state: z.literal("published"),
    manifest_hash: sha256Schema,
    content_hash: sha256Schema,
    source_run_id: opaqueIdSchema,
    source_step_ids: z.array(opaqueIdSchema).min(1),
    required_tools: z.array(z.string().min(1)),
    required_components: z.array(opaqueIdSchema),
    required_approvals: z.array(z.string().min(1)),
    created_by: opaqueIdSchema,
    created_at: isoDateTimeSchema,
    published_at: isoDateTimeSchema,
  })
  .strict();

export const skillBindingSchema = z
  .object({
    schemaVersion: schemaVersion1,
    id: opaqueIdSchema,
    coworker_id: opaqueIdSchema,
    skill_version_id: opaqueIdSchema,
    state: skillBindingStateSchema,
    attached_by: opaqueIdSchema,
    attached_at: isoDateTimeSchema,
    detached_at: isoDateTimeSchema.nullable(),
  })
  .strict();

export type SkillDraft = z.infer<typeof skillDraftSchema>;
export type SkillVersion = z.infer<typeof skillVersionSchema>;
export type SkillBinding = z.infer<typeof skillBindingSchema>;
