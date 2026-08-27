import { z } from "zod";
import { opaqueIdSchema, schemaVersion1 } from "./primitives";

/** UX-aligned roster availability for channel header and composer gating. */
export const channelRosterAvailabilitySchema = z.enum([
  "available",
  "queued",
  "busy",
  "needs_you",
  "cancelling",
  "disabled",
  "offline",
]);

export const channelRosterCoworkerSchema = z
  .object({
    participant_id: opaqueIdSchema,
    coworker_id: opaqueIdSchema,
    handle: z.string().min(1),
    name: z.string().min(1),
    title: z.string().min(1),
    role: z.literal("member"),
    availability: channelRosterAvailabilitySchema,
    assignment_summary: z.string().nullable(),
    effective_tools: z.array(z.string().min(1)),
  })
  .strict();

export const channelRosterResponseSchema = z
  .object({
    schemaVersion: schemaVersion1,
    channel_id: opaqueIdSchema,
    /** Noninteractive fixed service-account badge label for P0. */
    service_account_label: z.string().min(1),
    coworkers: z.array(channelRosterCoworkerSchema),
  })
  .strict();

export type ChannelRosterAvailability = z.infer<typeof channelRosterAvailabilitySchema>;
export type ChannelRosterCoworker = z.infer<typeof channelRosterCoworkerSchema>;
export type ChannelRosterResponse = z.infer<typeof channelRosterResponseSchema>;
