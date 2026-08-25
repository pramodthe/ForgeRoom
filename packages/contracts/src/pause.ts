import { z } from "zod";
import {
  isoDateTimeSchema,
  nonNegativeIntSchema,
  opaqueIdSchema,
  safeJsonValueSchema,
  schemaVersion1,
  sha256Schema,
} from "./primitives";

export const pauseGroupStateSchema = z.enum([
  "collecting",
  "ready",
  "resuming",
  "resumed",
  "stale",
  "expired",
  "cancelled",
  "uncertain",
]);

export const actionProposalStateSchema = z.enum([
  "proposed",
  "allowed",
  "denied",
  "expired",
  "stale",
  "executing",
  "succeeded",
  "failed",
  "unknown",
  "reconciled_succeeded",
  "reconciled_failed",
]);

export const pauseGroupSchema = z
  .object({
    schemaVersion: schemaVersion1,
    id: opaqueIdSchema,
    agent_turn_id: opaqueIdSchema,
    generation: z.number().int().positive(),
    state: pauseGroupStateSchema,
    required_action_count: nonNegativeIntSchema,
    resolved_action_count: nonNegativeIntSchema,
    created_at: isoDateTimeSchema,
  })
  .strict();

export const actionProposalSchema = z
  .object({
    schemaVersion: schemaVersion1,
    id: opaqueIdSchema,
    required_action_id: opaqueIdSchema,
    run_id: opaqueIdSchema,
    run_step_id: opaqueIdSchema,
    agent_turn_id: opaqueIdSchema,
    tool_call_id: opaqueIdSchema,
    session_generation_id: opaqueIdSchema,
    tool_name: z.string().min(1),
    observed_descriptor_hash: sha256Schema,
    arguments_hash: sha256Schema,
    target_hash: sha256Schema,
    redacted_arguments: safeJsonValueSchema,
    expected_effect: z.string().min(1),
    risk_class: z.enum(["low", "medium", "high"]),
    state: actionProposalStateSchema,
    expires_at: isoDateTimeSchema,
  })
  .strict();

export const approvalDecisionCommandSchema = z
  .object({
    decision: z.enum(["allow", "deny"]),
    expected_arguments_hash: sha256Schema,
    expected_descriptor_hash: sha256Schema,
    expected_session_generation: z.number().int().positive(),
    reason: z.string().min(1),
  })
  .strict();

export const questionSchema = z
  .object({
    schemaVersion: schemaVersion1,
    id: opaqueIdSchema,
    required_action_id: opaqueIdSchema,
    channel_id: opaqueIdSchema,
    run_id: opaqueIdSchema,
    prompt_hash: sha256Schema,
    prompt_redacted: safeJsonValueSchema,
    state: z.enum(["requested", "answered", "expired", "stale"]),
    expires_at: isoDateTimeSchema,
  })
  .strict();

export type PauseGroup = z.infer<typeof pauseGroupSchema>;
export type ActionProposal = z.infer<typeof actionProposalSchema>;
