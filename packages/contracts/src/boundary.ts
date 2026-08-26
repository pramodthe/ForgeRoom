import { z } from "zod";
import { agentChannelEnvelopeSchema } from "./events";
import {
  isoDateTimeSchema,
  nonNegativeIntSchema,
  opaqueIdSchema,
  safeJsonObjectSchema,
  schemaVersion1,
  sha256Schema,
} from "./primitives";
import { agentTurnStateSchema } from "./runs";

export const packageBoundarySchema = z
  .object({
    release: z.literal("0.1"),
    agUiProfile: z.literal("unset-pending-P0-210"),
    copilotKit: z.literal("disabled"),
    openGeneratedUi: z.literal("disabled"),
    upstreamAgUiAdapters: z.literal("owned-by-P0-211"),
  })
  .strict();

export type PackageBoundary = z.infer<typeof packageBoundarySchema>;

export const PACKAGE_BOUNDARY: PackageBoundary = {
  release: "0.1",
  agUiProfile: "unset-pending-P0-210",
  copilotKit: "disabled",
  openGeneratedUi: "disabled",
  upstreamAgUiAdapters: "owned-by-P0-211",
};

export function parsePackageBoundary(input: unknown): PackageBoundary {
  return packageBoundarySchema.parse(input);
}

export const internalWorkerCommandNameSchema = z.enum([
  "claim_queue_item",
  "provision_or_rotate_session",
  "create_or_reconcile_turn",
  "ingest_trueforge_event",
  "validate_and_persist_agui_envelope",
  "offer_and_recheck_component_tool",
  "finalize_or_quarantine_ui_instance",
  "apply_scoped_ui_interaction",
  "claim_pause_group_resume",
  "publish_sandbox_artifact",
  "reconcile_deterministic_provider_update",
]);

function internalWorkerCommand<
  Name extends z.infer<typeof internalWorkerCommandNameSchema>,
  PayloadSchema extends z.ZodTypeAny,
>(name: Name, payload: PayloadSchema) {
  return z
    .object({
      schemaVersion: schemaVersion1,
      command_id: opaqueIdSchema,
      name: z.literal(name),
      payload,
    })
    .strict();
}

const claimQueueItemCommandSchema = internalWorkerCommand(
  "claim_queue_item",
  z
    .object({
      queue_item_id: opaqueIdSchema,
      expected_state: z.enum(["queued", "retryable"]),
      expected_attempt: nonNegativeIntSchema,
      worker_id: opaqueIdSchema,
      lease_expires_at: isoDateTimeSchema,
    })
    .strict(),
);

const provisionOrRotateSessionCommandSchema = internalWorkerCommand(
  "provision_or_rotate_session",
  z
    .object({
      channel_id: opaqueIdSchema,
      coworker_id: opaqueIdSchema,
      logical_thread_id: opaqueIdSchema,
      expected_session_generation: nonNegativeIntSchema,
      requested_session_generation: z.number().int().positive(),
      expected_config_revision: nonNegativeIntSchema,
      reason: z.enum(["provision", "configuration_changed", "descriptor_drift", "reconnect"]),
    })
    .strict()
    .superRefine((value, ctx) => {
      if (value.requested_session_generation !== value.expected_session_generation + 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "requested_session_generation must exactly follow the expected generation",
          path: ["requested_session_generation"],
        });
      }
    }),
);

const createOrReconcileTurnCommandSchema = internalWorkerCommand(
  "create_or_reconcile_turn",
  z
    .object({
      run_id: opaqueIdSchema,
      run_step_id: opaqueIdSchema,
      agent_turn_id: opaqueIdSchema,
      logical_thread_id: opaqueIdSchema,
      expected_turn_state: agentTurnStateSchema.extract([
        "intended",
        "acquiring",
        "creating",
        "uncertain",
      ]),
      session_generation_id: opaqueIdSchema,
      expected_session_generation: z.number().int().positive(),
      application_run_token: opaqueIdSchema,
    })
    .strict(),
);

const ingestTrueForgeEventCommandSchema = internalWorkerCommand(
  "ingest_trueforge_event",
  z
    .object({
      run_id: opaqueIdSchema,
      run_step_id: opaqueIdSchema,
      agent_turn_id: opaqueIdSchema,
      expected_turn_state: agentTurnStateSchema.extract([
        "creating",
        "streaming",
        "required_actions",
      ]),
      session_generation_id: opaqueIdSchema,
      expected_session_generation: z.number().int().positive(),
      upstream_event_id: opaqueIdSchema,
      upstream_event_type: z.string().min(1),
      event_payload: safeJsonObjectSchema,
    })
    .strict(),
);

const validateAndPersistAguiEventCommandSchema = internalWorkerCommand(
  "validate_and_persist_agui_envelope",
  z
    .object({
      channel_id: opaqueIdSchema,
      expected_channel_sequence: nonNegativeIntSchema,
      expected_channel_revision: nonNegativeIntSchema.nullable(),
      expected_thread_revision: nonNegativeIntSchema.nullable(),
      expected_activity_revision: nonNegativeIntSchema.nullable(),
      envelope: agentChannelEnvelopeSchema,
    })
    .strict()
    .superRefine((value, ctx) => {
      if (value.envelope.channelId !== value.channel_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "envelope channelId must match the claimed channel",
          path: ["envelope", "channelId"],
        });
      }
      if (value.envelope.channelSequence !== value.expected_channel_sequence + 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "envelope channelSequence must exactly follow the expected sequence",
          path: ["envelope", "channelSequence"],
        });
      }
      const event = value.envelope.aguiEvent;
      if (event.type === "STATE_DELTA") {
        if (event.stateKind === "channel") {
          if (value.expected_channel_revision !== event.revision) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "channel delta revision must match expected_channel_revision",
              path: ["expected_channel_revision"],
            });
          }
          if (value.expected_thread_revision !== null) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "channel deltas cannot claim a thread revision",
              path: ["expected_thread_revision"],
            });
          }
        } else {
          if (value.expected_thread_revision !== event.revision) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "thread delta revision must match expected_thread_revision",
              path: ["expected_thread_revision"],
            });
          }
          if (value.expected_channel_revision !== null) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "thread deltas cannot claim a channel revision",
              path: ["expected_channel_revision"],
            });
          }
        }
      } else if (
        value.expected_channel_revision !== null ||
        value.expected_thread_revision !== null
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "non-delta envelopes cannot claim a state revision",
        });
      }

      if (event.type === "ACTIVITY_DELTA") {
        const firstOperation = event.patch[0];
        const testedRevision =
          firstOperation?.op === "test" &&
          firstOperation.path === "/activityRevision" &&
          typeof firstOperation.value === "number"
            ? firstOperation.value
            : undefined;
        if (value.expected_activity_revision !== testedRevision) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "activity delta base must match expected_activity_revision",
            path: ["expected_activity_revision"],
          });
        }
      } else if (value.expected_activity_revision !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "non-activity-delta envelopes cannot claim an activity revision",
          path: ["expected_activity_revision"],
        });
      }
    }),
);

const offerComponentToolCommandSchema = internalWorkerCommand(
  "offer_and_recheck_component_tool",
  z
    .object({
      channel_id: opaqueIdSchema,
      coworker_id: opaqueIdSchema,
      run_step_id: opaqueIdSchema,
      agent_turn_id: opaqueIdSchema,
      expected_session_generation: z.number().int().positive(),
      component_version_id: opaqueIdSchema,
      expected_descriptor_hash: sha256Schema,
      expected_grant_scope_hash: sha256Schema,
    })
    .strict(),
);

const finalizeUiInstanceCommandSchema = internalWorkerCommand(
  "finalize_or_quarantine_ui_instance",
  z
    .object({
      ui_instance_id: opaqueIdSchema,
      expected_status: z.enum(["building", "degraded"]),
      expected_render_revision: nonNegativeIntSchema.nullable(),
      next_render_revision: nonNegativeIntSchema,
      render_manifest_hash: sha256Schema,
      outcome: z.enum(["ready", "quarantined"]),
    })
    .strict()
    .superRefine((value, ctx) => {
      const expectedNext =
        value.expected_render_revision === null ? 1 : value.expected_render_revision + 1;
      if (value.next_render_revision !== expectedNext) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "next_render_revision must exactly follow the expected revision",
          path: ["next_render_revision"],
        });
      }
    }),
);

const applyUiInteractionCommandSchema = internalWorkerCommand(
  "apply_scoped_ui_interaction",
  z
    .object({
      interaction_id: opaqueIdSchema,
      ui_instance_id: opaqueIdSchema,
      expected_interaction_state: z.enum(["token_issued", "confirmed"]),
      expected_render_revision: nonNegativeIntSchema,
      expected_state_revision: nonNegativeIntSchema.nullable(),
      action_grant_id: opaqueIdSchema,
      expected_action_grant_use_count: nonNegativeIntSchema,
      redacted_input_hash: sha256Schema,
    })
    .strict(),
);

const claimPauseGroupResumeCommandSchema = internalWorkerCommand(
  "claim_pause_group_resume",
  z
    .object({
      pause_group_id: opaqueIdSchema,
      expected_state: z.literal("ready"),
      expected_generation: z.number().int().positive(),
      expected_required_action_count: z.number().int().positive(),
      expected_resolved_action_count: z.number().int().positive(),
      application_run_token: opaqueIdSchema,
      response_payload_hash: sha256Schema,
      resume_claim_token: opaqueIdSchema,
      worker_id: opaqueIdSchema,
    })
    .strict()
    .superRefine((value, ctx) => {
      if (value.expected_resolved_action_count !== value.expected_required_action_count) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "a resume claim requires every RequiredAction to be resolved",
          path: ["expected_resolved_action_count"],
        });
      }
    }),
);

const publishSandboxArtifactCommandSchema = internalWorkerCommand(
  "publish_sandbox_artifact",
  z
    .object({
      sandbox_id: opaqueIdSchema,
      run_id: opaqueIdSchema,
      run_step_id: opaqueIdSchema,
      artifact_id: opaqueIdSchema,
      expected_sandbox_state: z.literal("command_completed"),
      expected_artifact_revision: nonNegativeIntSchema,
      next_artifact_revision: z.number().int().positive(),
      content_hash: sha256Schema,
      byte_size: nonNegativeIntSchema,
    })
    .strict()
    .superRefine((value, ctx) => {
      if (value.next_artifact_revision !== value.expected_artifact_revision + 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "next_artifact_revision must exactly follow the expected revision",
          path: ["next_artifact_revision"],
        });
      }
    }),
);

const reconcileDeterministicProviderUpdateCommandSchema = internalWorkerCommand(
  "reconcile_deterministic_provider_update",
  z
    .object({
      action_proposal_id: opaqueIdSchema,
      expected_proposal_state: z.enum(["executing", "unknown"]),
      connector_binding_id: opaqueIdSchema,
      account_id: opaqueIdSchema,
      provider_idempotency_key: z.string().min(1).max(512),
      expected_arguments_hash: sha256Schema,
      expected_target_hash: sha256Schema,
    })
    .strict(),
);

export const internalWorkerCommandSchema = z.discriminatedUnion("name", [
  claimQueueItemCommandSchema,
  provisionOrRotateSessionCommandSchema,
  createOrReconcileTurnCommandSchema,
  ingestTrueForgeEventCommandSchema,
  validateAndPersistAguiEventCommandSchema,
  offerComponentToolCommandSchema,
  finalizeUiInstanceCommandSchema,
  applyUiInteractionCommandSchema,
  claimPauseGroupResumeCommandSchema,
  publishSandboxArtifactCommandSchema,
  reconcileDeterministicProviderUpdateCommandSchema,
]);

export const apiMetaSchema = z
  .object({
    request_id: opaqueIdSchema,
  })
  .strict();

export type InternalWorkerCommand = z.infer<typeof internalWorkerCommandSchema>;
