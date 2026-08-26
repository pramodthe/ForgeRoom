import { z } from "zod";
import {
  nonNegativeIntSchema,
  opaqueIdSchema,
  schemaVersion1,
  sha256Schema,
} from "./primitives";

export const channelContextRosterEntrySchema = z
  .object({
    participant_type: z.enum(["human", "coworker"]),
    participant_id: opaqueIdSchema,
    role: z.string().min(1),
    handle: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
  })
  .strict();

export const channelContextPinRefSchema = z
  .object({
    id: opaqueIdSchema,
    label: z.string().min(1),
    source_message_id: opaqueIdSchema.nullable(),
    source_artifact_id: opaqueIdSchema.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const sourceCount =
      Number(value.source_message_id !== null) + Number(value.source_artifact_id !== null);
    if (sourceCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "a context pin must reference exactly one source",
      });
    }
  });

export const channelContextSafeArtifactSchema = z
  .object({
    id: opaqueIdSchema,
    name: z.string().min(1),
    kind: z.enum(["file", "preview"]),
    mime_type: z.string().min(1),
    revision: z.number().int().positive(),
    sha256: sha256Schema,
  })
  .strict();

export const channelContextAssignmentSchema = z
  .object({
    coworker_id: opaqueIdSchema,
    run_id: opaqueIdSchema.nullable(),
    run_step_id: opaqueIdSchema.nullable(),
    goal: z.string().nullable(),
    objective: z.string().nullable(),
  })
  .strict();

export const channelContextDeltaSchema = z
  .object({
    sequence: nonNegativeIntSchema,
    type: z.string().min(1),
    summary: z.string(),
  })
  .strict();

export const channelContextEnvelopeSchema = z
  .object({
    schemaVersion: schemaVersion1,
    version: z.literal("CHANNEL_CONTEXT_V1"),
    channel: z
      .object({
        id: opaqueIdSchema,
        name: z.string().min(1),
        mission_brief: z.string(),
      })
      .strict(),
    roster: z.array(channelContextRosterEntrySchema),
    assignment: channelContextAssignmentSchema.nullable(),
    pins: z.array(channelContextPinRefSchema),
    artifacts: z.array(channelContextSafeArtifactSchema),
    summary: z.string(),
    recent_deltas: z.array(channelContextDeltaSchema),
    human_request: z.string(),
    last_delivered_channel_sequence: nonNegativeIntSchema,
    untrusted_content_notice: z.string().min(1),
  })
  .strict();

export type ChannelContextEnvelope = z.infer<typeof channelContextEnvelopeSchema>;
export type ChannelContextRosterEntry = z.infer<typeof channelContextRosterEntrySchema>;
export type ChannelContextPinRef = z.infer<typeof channelContextPinRefSchema>;
export type ChannelContextSafeArtifact = z.infer<typeof channelContextSafeArtifactSchema>;
export type ChannelContextAssignment = z.infer<typeof channelContextAssignmentSchema>;
export type ChannelContextDelta = z.infer<typeof channelContextDeltaSchema>;
