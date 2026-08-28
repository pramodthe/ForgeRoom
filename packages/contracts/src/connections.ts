import { z } from "zod";
import { actingIdentitySchema } from "./pause";
import { opaqueIdSchema, schemaVersion1, sha256Schema, isoDateTimeSchema } from "./primitives";

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

export const connectionToolDescriptorSchema = z
  .object({
    tool_name: z.string().min(1),
    descriptor_hash: sha256Schema,
  })
  .strict();

export const connectionStatusViewSchema = z
  .object({
    schemaVersion: schemaVersion1,
    id: opaqueIdSchema,
    workspace_id: opaqueIdSchema,
    provider: z.literal("composio"),
    toolkit: z.string().min(1),
    trueforge_connector_name: z.string().min(1),
    status: connectionStatusSchema,
    /** Expired/revoked/drifted map to application blocked_connection; never select a fallback account. */
    blocks_dispatch: z.boolean(),
    run_step_state: z.enum(["blocked_connection"]).nullable(),
    acting_identity: actingIdentitySchema,
    owner_class: z.literal("workspace_service"),
    scopes: z.array(z.string().min(1)),
    toolkit_health: z.enum([
      "healthy",
      "expired",
      "disabled",
      "inactive",
      "drifted",
      "unconfigured",
    ]),
    tools: z.array(connectionToolDescriptorSchema).min(1),
    account_suffix: z.string().min(1),
    verified_at: isoDateTimeSchema.nullable(),
    catalog_browse_allowed: z.literal(false),
    account_selection_allowed: z.literal(false),
    capability_expansion_allowed: z.literal(false),
  })
  .strict();

export const connectionListItemSchema = z
  .object({
    id: opaqueIdSchema,
    toolkit: z.string().min(1),
    status: connectionStatusSchema,
    acting_identity: actingIdentitySchema,
    verified_at: isoDateTimeSchema.nullable(),
  })
  .strict();

export const connectionTestResultSchema = z
  .object({
    schemaVersion: schemaVersion1,
    connection_id: opaqueIdSchema,
    ok: z.boolean(),
    status: connectionStatusSchema,
    blocks_dispatch: z.boolean(),
    run_step_state: z.enum(["blocked_connection"]).nullable(),
    checked_tool: z.string().min(1),
    checked_descriptor_hash: sha256Schema,
    verified_at: isoDateTimeSchema,
    safe_summary: z.string().min(1).nullable(),
    reason: z.string().min(1).nullable(),
  })
  .strict();

export const connectionReconnectResultSchema = z
  .object({
    schemaVersion: schemaVersion1,
    connection_id: opaqueIdSchema,
    intent_id: opaqueIdSchema,
    status: z.literal("connecting"),
    /** Short-lived Composio Connect Link URL (no credentials). */
    redirect_url: z.string().url(),
    expires_at: isoDateTimeSchema,
    workspace_bound: z.literal(true),
    expected_account_suffix: z.string().min(1),
  })
  .strict();

export const connectionReconnectStatusSchema = z
  .object({
    schemaVersion: schemaVersion1,
    connection_id: opaqueIdSchema,
    intent_id: opaqueIdSchema.nullable(),
    reconnect_state: z.enum(["idle", "pending", "completed", "expired", "identity_mismatch"]),
    connection_status: connectionStatusSchema,
    blocks_dispatch: z.boolean(),
    run_step_state: z.enum(["blocked_connection"]).nullable(),
    /** True when a link-created account differed from the pinned account and was ignored. */
    fallback_account_rejected: z.boolean(),
    verified_at: isoDateTimeSchema.nullable(),
  })
  .strict();

export type ConnectionStatus = z.infer<typeof connectionStatusSchema>;
export type ConnectionTestCommand = z.infer<typeof connectionTestCommandSchema>;
export type ConnectionReconnectCommand = z.infer<typeof connectionReconnectCommandSchema>;
export type ConnectionStatusView = z.infer<typeof connectionStatusViewSchema>;
export type ConnectionListItem = z.infer<typeof connectionListItemSchema>;
export type ConnectionTestResult = z.infer<typeof connectionTestResultSchema>;
export type ConnectionReconnectResult = z.infer<typeof connectionReconnectResultSchema>;
export type ConnectionReconnectStatus = z.infer<typeof connectionReconnectStatusSchema>;
