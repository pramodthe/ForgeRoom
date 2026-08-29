import { z } from "zod";
import { isoDateTimeSchema, opaqueIdSchema, schemaVersion1, sha256Schema } from "./primitives";

export const skillDraftStateSchema = z.enum(["draft", "published"]);
export const skillBindingStateSchema = z.enum(["active", "detached", "blocked"]);

export const skillDraftSchema = z
  .object({
    schemaVersion: schemaVersion1,
    id: opaqueIdSchema,
    workspace_id: opaqueIdSchema,
    revision: z.number().int().positive(),
    draft_hash: sha256Schema,
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
  .strict()
  .superRefine((value, ctx) => {
    if (value.state === "active" && value.detached_at !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "active skill bindings cannot have detached_at",
      });
    }
    if (value.state === "detached" && value.detached_at === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "detached skill bindings require detached_at",
      });
    }
  });

export const skillDraftCreateCommandSchema = z
  .object({
    schemaVersion: schemaVersion1,
    source_step_ids: z.array(opaqueIdSchema).min(1),
    idempotency_key: z.string().min(1),
  })
  .strict();

export const skillDraftReviseCommandSchema = z
  .object({
    schemaVersion: schemaVersion1,
    expected_revision: z.number().int().positive(),
    expected_draft_hash: sha256Schema,
    when_to_use: z.string().min(1).optional(),
    inputs: z.array(z.string().min(1)).optional(),
    method: z.array(z.string().min(1)).min(1).optional(),
    validation: z.string().min(1).optional(),
    output: z.string().min(1).optional(),
    failures: z.array(z.string()).optional(),
    idempotency_key: z.string().min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    const editableFields = [
      "when_to_use",
      "inputs",
      "method",
      "validation",
      "output",
      "failures",
    ] as const;
    if (!editableFields.some((field) => Object.prototype.hasOwnProperty.call(value, field))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "skill draft revision must include an editable field",
      });
    }
  });

export const skillDraftPublishCommandSchema = z
  .object({
    schemaVersion: schemaVersion1,
    expected_revision: z.number().int().positive(),
    expected_draft_hash: sha256Schema,
    expected_source_content_hash: sha256Schema,
    idempotency_key: z.string().min(1),
  })
  .strict();

export const skillBindingCreateCommandSchema = z
  .object({
    schemaVersion: schemaVersion1,
    skill_version_id: opaqueIdSchema,
    expected_manifest_hash: sha256Schema,
    expected_coworker_config_revision: z.number().int().nonnegative(),
    idempotency_key: z.string().min(1),
  })
  .strict();

export const skillBindingDeleteCommandSchema = z
  .object({
    schemaVersion: schemaVersion1,
    expected_state: z.enum(["active", "blocked"]),
    idempotency_key: z.string().min(1),
  })
  .strict();

export type SkillDraft = z.infer<typeof skillDraftSchema>;
export type SkillVersion = z.infer<typeof skillVersionSchema>;
export type SkillBinding = z.infer<typeof skillBindingSchema>;
export type SkillDraftCreateCommand = z.infer<typeof skillDraftCreateCommandSchema>;
export type SkillDraftReviseCommand = z.infer<typeof skillDraftReviseCommandSchema>;
export type SkillDraftPublishCommand = z.infer<typeof skillDraftPublishCommandSchema>;
export type SkillBindingCreateCommand = z.infer<typeof skillBindingCreateCommandSchema>;
export type SkillBindingDeleteCommand = z.infer<typeof skillBindingDeleteCommandSchema>;
