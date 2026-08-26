import { z } from "zod";
import { opaqueIdSchema, schemaVersion1, sha256Schema } from "./primitives";

export const connectionStatusSchema = z.enum([
  "unconfigured",
  "connecting",
  "active",
  "expired",
  "revoked",
  "drifted",
]);

export const connectionTestCommandSchema = z
  .object({
    schemaVersion: schemaVersion1,
    expected_connection_id: opaqueIdSchema,
    expected_descriptor_hash: sha256Schema,
    idempotency_key: z.string().min(1),
  })
  .strict();

export const connectionReconnectCommandSchema = z
  .object({
    schemaVersion: schemaVersion1,
    expected_connection_id: opaqueIdSchema,
    expected_status: connectionStatusSchema,
    idempotency_key: z.string().min(1),
  })
  .strict();

export type ConnectionStatus = z.infer<typeof connectionStatusSchema>;
export type ConnectionTestCommand = z.infer<typeof connectionTestCommandSchema>;
export type ConnectionReconnectCommand = z.infer<typeof connectionReconnectCommandSchema>;
