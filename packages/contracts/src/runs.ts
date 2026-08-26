import { z } from "zod";
import {
  isoDateTimeSchema,
  nonNegativeIntSchema,
  opaqueIdSchema,
  schemaVersion1,
} from "./primitives";
import { routingModeSchema } from "./channels";

export const runLifecycleSchema = z.enum([
  "queued",
  "active",
  "completed",
  "partial",
  "failed",
  "cancelled",
]);

export type RunLifecycle = z.infer<typeof runLifecycleSchema>;

export const runActivityCountersSchema = z
  .object({
    planning: nonNegativeIntSchema,
    running: nonNegativeIntSchema,
    awaiting_input: nonNegativeIntSchema,
    awaiting_approval: nonNegativeIntSchema,
    blocked_connection: nonNegativeIntSchema,
    cancelling: nonNegativeIntSchema,
    queued: nonNegativeIntSchema,
  })
  .strict();

export type RunActivityCounters = z.infer<typeof runActivityCountersSchema>;

export const runStepStateSchema = z.enum([
  "queued",
  "acquiring_session",
  "running",
  "awaiting_input",
  "awaiting_approval",
  "blocked_connection",
  "cancelling",
  "cancelled",
  "completed",
  "failed",
  "unknown",
]);

export const agentTurnStateSchema = z.enum([
  "intended",
  "acquiring",
  "creating",
  "streaming",
  "required_actions",
  "resuming",
  "completed",
  "failed",
  "cancelled",
  "uncertain",
]);

export const runStepSchema = z
  .object({
    schemaVersion: schemaVersion1,
    id: opaqueIdSchema,
    run_id: opaqueIdSchema,
    assigned_coworker_id: opaqueIdSchema,
    logical_thread_id: opaqueIdSchema,
    objective: z.string().min(1),
    state: runStepStateSchema,
    attempt: z.number().int().positive(),
  })
  .strict();

export const runSchema = z
  .object({
    schemaVersion: schemaVersion1,
    id: opaqueIdSchema,
    channel_id: opaqueIdSchema,
    source_message_id: opaqueIdSchema,
    requested_by: opaqueIdSchema,
    routing_mode: routingModeSchema,
    goal: z.string().min(1),
    lifecycle: runLifecycleSchema,
    activity: runActivityCountersSchema,
    steps: z.array(runStepSchema),
    started_at: isoDateTimeSchema.nullable(),
    completed_at: isoDateTimeSchema.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    value.steps.forEach((step, index) => {
      if (step.run_id !== value.id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "nested RunStep must belong to the containing Run",
          path: ["steps", index, "run_id"],
        });
      }
    });
  });

export const runCancelCommandSchema = z
  .object({
    schemaVersion: schemaVersion1,
    expected_lifecycle: runLifecycleSchema,
    reason: z.string().min(1),
    idempotency_key: z.string().min(1),
  })
  .strict();

export const runSteerCommandSchema = z
  .object({
    schemaVersion: schemaVersion1,
    instruction: z.string().min(1),
    idempotency_key: z.string().min(1),
  })
  .strict();

export const runStepCancelCommandSchema = z
  .object({
    schemaVersion: schemaVersion1,
    expected_state: runStepStateSchema,
    reason: z.string().min(1),
    idempotency_key: z.string().min(1),
  })
  .strict();

export type Run = z.infer<typeof runSchema>;
export type RunStep = z.infer<typeof runStepSchema>;
export type RunStepState = z.infer<typeof runStepStateSchema>;
export type AgentTurnState = z.infer<typeof agentTurnStateSchema>;
export type RunCancelCommand = z.infer<typeof runCancelCommandSchema>;
export type RunSteerCommand = z.infer<typeof runSteerCommandSchema>;
