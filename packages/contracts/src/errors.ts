import { z } from "zod";
import { opaqueIdSchema, safeJsonValueSchema } from "./primitives";

export const errorCodeSchema = z.enum([
  "unauthenticated",
  "forbidden",
  "csrf_failed",
  "not_found",
  "validation_failed",
  "conflict",
  "recipient_required",
  "recipient_unavailable",
  "session_rotating",
  "connector_blocked",
  "descriptor_drift",
  "stale_proposal",
  "expired_proposal",
  "decision_already_recorded",
  "run_not_stoppable",
  "unknown_external_outcome",
  "provider_unavailable",
  "agui_version_mismatch",
  "invalid_state_patch",
  "component_not_granted",
  "component_version_mismatch",
  "component_schema_invalid",
  "ui_instance_stale",
  "ui_interaction_not_allowed",
  "unsupported_ui_rail",
  "stale_coworker_draft",
  "coworker_provisioning_failed",
  "stale_task_revision",
  "task_transition_not_allowed",
  "skill_requirements_missing",
]);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const errorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: errorCodeSchema,
        message: z.string().min(1),
        request_id: opaqueIdSchema,
        retryable: z.boolean(),
        details: z.record(z.string(), safeJsonValueSchema).default({}),
      })
      .strict(),
  })
  .strict();

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
