import { z } from "zod";
import {
  isoDateTimeSchema,
  nonNegativeIntSchema,
  opaqueIdSchema,
  schemaVersion1,
  sha256Schema,
} from "./primitives";
import { taskRecordOperationSchema } from "./tasks";

/** Case-insensitive handles reserved for routing syntax — cannot name a coworker. */
export const RESERVED_COWORKER_HANDLES = ["team"] as const;

/** P0 TrueForge model presets that are known to provision successfully. */
export const P0_COWORKER_MODEL_PRESETS = ["default", "openai/gpt-5-4-mini"] as const;

export type P0CoworkerModelPreset = (typeof P0_COWORKER_MODEL_PRESETS)[number];

export function coworkerModelPresetError(preset: string): string | null {
  const trimmed = preset.trim();
  if (!trimmed) {
    return "Model preset is required.";
  }
  if (!(P0_COWORKER_MODEL_PRESETS as readonly string[]).includes(trimmed)) {
    return `Model preset must be one of: ${P0_COWORKER_MODEL_PRESETS.join(", ")}.`;
  }
  return null;
}

export function isReservedCoworkerHandle(handle: string): boolean {
  const lowered = handle.toLowerCase();
  return RESERVED_COWORKER_HANDLES.some((reserved) => reserved === lowered);
}

function rejectReservedCoworkerHandle(value: { handle: string }, ctx: z.RefinementCtx): void {
  if (isReservedCoworkerHandle(value.handle)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Coworker handle is reserved for routing syntax.",
      path: ["handle"],
    });
  }
}

function rejectInvalidCoworkerModelPreset(
  value: { model_preset: string },
  ctx: z.RefinementCtx,
): void {
  const message = coworkerModelPresetError(value.model_preset);
  if (message) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message,
      path: ["model_preset"],
    });
  }
}

function rejectInvalidCoworkerProposal(value: CoworkerProposalShape, ctx: z.RefinementCtx): void {
  rejectReservedCoworkerHandle(value, ctx);
  rejectInvalidCoworkerModelPreset(value, ctx);
}

type CoworkerProposalShape = {
  handle: string;
  model_preset: string;
};

export const coworkerDraftStateSchema = z.enum([
  "draft",
  "awaiting_review",
  "confirmed",
  "provisioning",
  "ready",
  "superseded",
  "expired",
  "rejected",
  "failed_provisioning",
]);

export type CoworkerDraftState = z.infer<typeof coworkerDraftStateSchema>;

export const coworkerBudgetSchema = z
  .object({
    max_turn_tokens: nonNegativeIntSchema,
    max_tool_calls: nonNegativeIntSchema,
  })
  .strict();

const coworkerProposalBaseSchema = z
  .object({
    schemaVersion: schemaVersion1,
    name: z.string().min(1),
    handle: z.string().min(1),
    title: z.string().min(1),
    standing_instructions: z.string(),
    model_preset: z.string().min(1),
    native_subagents_enabled: z.literal(false),
    channel_ids: z.array(opaqueIdSchema),
    budget: coworkerBudgetSchema,
    task_record_grants: z.array(
      z
        .object({
          channel_id: opaqueIdSchema,
          operations: z.array(taskRecordOperationSchema).min(1),
        })
        .strict(),
    ),
    tool_grants: z.array(z.string().min(1)),
    skill_version_ids: z.array(opaqueIdSchema),
    component_version_ids: z.array(opaqueIdSchema),
  })
  .strict();

export const coworkerProposalSchema = coworkerProposalBaseSchema.superRefine(
  rejectInvalidCoworkerProposal,
);

export const coworkerEffectivePreviewSchema = z
  .object({
    schemaVersion: schemaVersion1,
    model: z.string().min(1),
    tools: z.array(z.string().min(1)),
    skills: z.array(opaqueIdSchema),
    components: z.array(opaqueIdSchema),
    account: z.string().min(1),
    channels: z.array(opaqueIdSchema),
    sandbox: z.boolean(),
    denials: z.array(z.string().min(1)),
    native_subagents_enabled: z.literal(false),
  })
  .strict();

export const coworkerDraftSchema = z
  .object({
    schemaVersion: schemaVersion1,
    id: opaqueIdSchema,
    workspace_id: opaqueIdSchema,
    revision: z.number().int().positive(),
    draft_hash: sha256Schema,
    policy_revision: nonNegativeIntSchema,
    catalog_revision: nonNegativeIntSchema,
    state: coworkerDraftStateSchema,
    proposal: coworkerProposalSchema,
    effective_preview: coworkerEffectivePreviewSchema,
    created_by: opaqueIdSchema,
    expires_at: isoDateTimeSchema,
    created_at: isoDateTimeSchema,
  })
  .strict();

export const coworkerDraftConfirmCommandSchema = z
  .object({
    schemaVersion: schemaVersion1,
    draft_revision: z.number().int().positive(),
    draft_hash: sha256Schema,
    policy_revision: nonNegativeIntSchema,
    catalog_revision: nonNegativeIntSchema,
    idempotency_key: z.string().min(1),
  })
  .strict();

export const coworkerDraftCreateCommandSchema = z
  .object({
    schemaVersion: schemaVersion1,
    request: z.string().min(1),
    idempotency_key: z.string().min(1),
  })
  .strict();

export const coworkerDraftReviseCommandSchema = z
  .object({
    schemaVersion: schemaVersion1,
    draft_revision: z.number().int().positive(),
    draft_hash: sha256Schema,
    revision_request: z.string().min(1),
    idempotency_key: z.string().min(1),
  })
  .strict();

export const coworkerDraftRejectCommandSchema = z
  .object({
    schemaVersion: schemaVersion1,
    draft_revision: z.number().int().positive(),
    draft_hash: sha256Schema,
    reason: z.string().min(1),
    idempotency_key: z.string().min(1),
  })
  .strict();

export const coworkerUpdateCommandSchema = coworkerProposalBaseSchema
  .omit({ schemaVersion: true })
  .superRefine(rejectInvalidCoworkerProposal);

export const coworkerDisableCommandSchema = z
  .object({
    schemaVersion: schemaVersion1,
    expected_config_revision: nonNegativeIntSchema,
    reason: z.string().min(1),
    idempotency_key: z.string().min(1),
  })
  .strict();

export const coworkerProfileSchema = z
  .object({
    schemaVersion: schemaVersion1,
    id: opaqueIdSchema,
    workspace_id: opaqueIdSchema,
    handle: z.string().min(1),
    name: z.string().min(1),
    title: z.string().min(1),
    status: z.enum(["active", "disabled"]),
    native_subagents_enabled: z.literal(false),
    current_version_id: opaqueIdSchema.nullable(),
    config_revision: nonNegativeIntSchema,
  })
  .strict();

export type CoworkerDraft = z.infer<typeof coworkerDraftSchema>;
export type CoworkerProposal = z.infer<typeof coworkerProposalSchema>;
export type CoworkerEffectivePreview = z.infer<typeof coworkerEffectivePreviewSchema>;
export type CoworkerDraftCreateCommand = z.infer<typeof coworkerDraftCreateCommandSchema>;
export type CoworkerDraftReviseCommand = z.infer<typeof coworkerDraftReviseCommandSchema>;
export type CoworkerDraftConfirmCommand = z.infer<typeof coworkerDraftConfirmCommandSchema>;
export type CoworkerDraftRejectCommand = z.infer<typeof coworkerDraftRejectCommandSchema>;
export type CoworkerUpdateCommand = z.infer<typeof coworkerUpdateCommandSchema>;
export type CoworkerDisableCommand = z.infer<typeof coworkerDisableCommandSchema>;
export type CoworkerProfile = z.infer<typeof coworkerProfileSchema>;
