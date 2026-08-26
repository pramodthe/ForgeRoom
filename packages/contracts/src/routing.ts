import { z } from "zod";
import { routingModeSchema } from "./channels";

/** Stable reasons for failed mention/team recipient resolution. */
export const routingFailureReasonSchema = z.enum([
  "recipient_required",
  "unknown_handle",
  "disabled_coworker",
  "non_member",
  "ambiguous_handle",
  "recipient_unavailable",
  "team_empty",
  "team_too_large",
  "fanout_too_large",
  "conflicting_routing",
]);

export type RoutingFailureReason = z.infer<typeof routingFailureReasonSchema>;

export const routingFailureCodeSchema = z.enum([
  "recipient_required",
  "recipient_unavailable",
  "validation_failed",
]);

export type RoutingFailureCode = z.infer<typeof routingFailureCodeSchema>;

/** Successful direct or team fan-out resolution. P0 caps recipients at two. */
export const routingResolutionSuccessSchema = z
  .object({
    ok: z.literal(true),
    routing_mode: routingModeSchema,
    recipient_handles: z.array(z.string().min(1)).min(1).max(2),
  })
  .strict();

export const routingResolutionFailureSchema = z
  .object({
    ok: z.literal(false),
    code: routingFailureCodeSchema,
    reason: routingFailureReasonSchema,
    message: z.string().min(1),
    details: z.record(z.unknown()).default({}),
  })
  .strict();

export const routingResolutionSchema = z.discriminatedUnion("ok", [
  routingResolutionSuccessSchema,
  routingResolutionFailureSchema,
]);

export type RoutingResolutionSuccess = z.infer<typeof routingResolutionSuccessSchema>;
export type RoutingResolutionFailure = z.infer<typeof routingResolutionFailureSchema>;
export type RoutingResolution = z.infer<typeof routingResolutionSchema>;

/** P0 hard cap for mention/@team fan-out. */
export const P0_MAX_ROUTING_RECIPIENTS = 2 as const;
