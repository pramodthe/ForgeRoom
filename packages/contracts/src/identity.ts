import { z } from "zod";
import { isoDateTimeSchema, opaqueIdSchema, schemaVersion1 } from "./primitives";

export const actorKindSchema = z.enum(["human", "coworker", "native_subagent", "system"]);
export type ActorKind = z.infer<typeof actorKindSchema>;

export const p0ActorKindSchema = z.enum(["human", "coworker", "system"]);

export const sessionUserSchema = z
  .object({
    id: opaqueIdSchema,
    email: z.string().email(),
    display_name: z.string().min(1),
    role: z.literal("owner"),
  })
  .strict();

export const sessionResponseSchema = z
  .object({
    request_id: opaqueIdSchema,
    user: sessionUserSchema,
    workspace_id: opaqueIdSchema,
    csrf_token: z.string().min(1),
    expires_at: isoDateTimeSchema,
  })
  .strict();

export const loginRequestSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1),
  })
  .strict();

export const logoutCommandSchema = z
  .object({
    schemaVersion: schemaVersion1,
  })
  .strict();

export type SessionResponse = z.infer<typeof sessionResponseSchema>;
