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

export const channelMessageCommandSchema = z
  .object({
    body: z.string().min(1),
    recipient_handles: z.array(z.string().min(1)).default([]),
    routing_mode: routingModeSchema,
    parent_message_id: opaqueIdSchema.nullable(),
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
  .strict();

export type Channel = z.infer<typeof channelSchema>;
export type ChannelMessageCommand = z.infer<typeof channelMessageCommandSchema>;
