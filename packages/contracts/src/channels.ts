import { z } from "zod";
import { isoDateTimeSchema, opaqueIdSchema, schemaVersion1 } from "./primitives";

export const channelStatusSchema = z.enum(["active", "archived"]);

export const channelSchema = z
  .object({
    schemaVersion: schemaVersion1,
    id: opaqueIdSchema,
    workspace_id: opaqueIdSchema,
    name: z.string().min(1),
    mission_brief: z.string(),
    status: channelStatusSchema,
    next_sequence: z.number().int().nonnegative(),
    created_at: isoDateTimeSchema,
    updated_at: isoDateTimeSchema,
  })
  .strict();

export const routingModeSchema = z.enum(["direct", "team"]);

const idempotencyKeySchema = z.string().min(1);

export const channelCreateCommandSchema = z
  .object({
    schemaVersion: schemaVersion1,
    name: z.string().min(1),
    mission_brief: z.string(),
    idempotency_key: idempotencyKeySchema,
  })
  .strict();

export const channelUpdateCommandSchema = z
  .object({
    schemaVersion: schemaVersion1,
    name: z.string().min(1).optional(),
    mission_brief: z.string().optional(),
    idempotency_key: idempotencyKeySchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.name === undefined && value.mission_brief === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "channel update must change name or mission_brief",
      });
    }
  });

export const channelArchiveCommandSchema = z
  .object({
    schemaVersion: schemaVersion1,
    idempotency_key: idempotencyKeySchema,
  })
  .strict();

export const channelParticipantAddCommandSchema = z
  .object({
    schemaVersion: schemaVersion1,
    participant_type: z.literal("coworker"),
    participant_id: opaqueIdSchema,
    role: z.enum(["member", "coordinator"]),
    idempotency_key: idempotencyKeySchema,
  })
  .strict();

export const channelParticipantRemoveCommandSchema = z
  .object({
    schemaVersion: schemaVersion1,
    idempotency_key: idempotencyKeySchema,
  })
  .strict();

export const channelMessageCommandSchema = z
  .object({
    body: z.string().min(1),
    recipient_handles: z.array(z.string().min(1)).default([]),
    routing_mode: routingModeSchema,
    parent_message_id: opaqueIdSchema.nullable(),
    /** Present for live composer sends; optional so older callers remain valid. */
    idempotency_key: idempotencyKeySchema.optional(),
  })
  .strict();

export const channelPinSchema = z
  .object({
    id: opaqueIdSchema,
    channel_id: opaqueIdSchema,
    source_message_id: opaqueIdSchema.nullable(),
    source_artifact_id: opaqueIdSchema.nullable(),
    label: z.string().min(1),
    pinned_by: opaqueIdSchema,
    created_at: isoDateTimeSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const sourceCount =
      Number(value.source_message_id !== null) + Number(value.source_artifact_id !== null);
    if (sourceCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "a channel pin must reference exactly one source",
      });
    }
  });

export const channelPinCreateCommandSchema = z
  .object({
    schemaVersion: schemaVersion1,
    source_message_id: opaqueIdSchema.nullable(),
    source_artifact_id: opaqueIdSchema.nullable(),
    label: z.string().min(1),
    idempotency_key: idempotencyKeySchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const sourceCount =
      Number(value.source_message_id !== null) + Number(value.source_artifact_id !== null);
    if (sourceCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "a channel pin command must reference exactly one source",
      });
    }
  });

export const channelPinRemoveCommandSchema = z
  .object({
    schemaVersion: schemaVersion1,
    idempotency_key: idempotencyKeySchema,
  })
  .strict();

export type Channel = z.infer<typeof channelSchema>;
export type ChannelMessageCommand = z.infer<typeof channelMessageCommandSchema>;
export type ChannelCreateCommand = z.infer<typeof channelCreateCommandSchema>;
export type ChannelUpdateCommand = z.infer<typeof channelUpdateCommandSchema>;
export type ChannelArchiveCommand = z.infer<typeof channelArchiveCommandSchema>;
export type ChannelParticipantAddCommand = z.infer<typeof channelParticipantAddCommandSchema>;
export type ChannelParticipantRemoveCommand = z.infer<typeof channelParticipantRemoveCommandSchema>;
export type ChannelPin = z.infer<typeof channelPinSchema>;
export type ChannelPinCreateCommand = z.infer<typeof channelPinCreateCommandSchema>;
export type ChannelPinRemoveCommand = z.infer<typeof channelPinRemoveCommandSchema>;
