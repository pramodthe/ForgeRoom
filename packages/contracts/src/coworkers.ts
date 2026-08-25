import { z } from "zod";
import {
  isoDateTimeSchema,
  nonNegativeIntSchema,
  opaqueIdSchema,
  schemaVersion1,
  sha256Schema,
} from "./primitives";

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

export const taskRecordOperationSchema = z.enum(["create", "update_status", "update_fields"]);

export const coworkerBudgetSchema = z
  .object({
    max_turn_tokens: nonNegativeIntSchema,
    max_tool_calls: nonNegativeIntSchema,
  })
  .strict();

export const coworkerProposalSchema = z
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
    draft_revision: z.number().int().positive(),
    draft_hash: sha256Schema,
    policy_revision: nonNegativeIntSchema,
    catalog_revision: nonNegativeIntSchema,
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
