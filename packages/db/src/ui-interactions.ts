import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type postgres from "postgres";
import { canonicalizeJson, transitionUiInteraction } from "@forgeroom/domain";
import type {
  ActionGrant,
  SafeJsonValue,
  UiInteractionResult,
  UiInteractionTokenRequest,
} from "@forgeroom/contracts";
import {
  actionGrantSchema,
  interpretP0ActionGrant,
  safeJsonValueSchema,
  safeJsonObjectSchema,
  uiInteractionTokenRequestSchema,
} from "@forgeroom/contracts";
import { enqueueComponentInterruptContinuationInTx } from "./component-interrupt-continuation";
import {
  loadRetainedDataGrantSnapshot,
  resolveRetainedDataGrantRead,
} from "./retained-data-grants";

export type SqlClient = postgres.Sql;

type InteractionErrorCode =
  | "not_found"
  | "forbidden"
  | "validation_failed"
  | "conflict"
  | "ui_instance_stale"
  | "ui_interaction_not_allowed";

export type UiInteractionDbError = {
  code: InteractionErrorCode;
  message: string;
};

export type UiInteractionDbResult<T> =
  { ok: true; value: T } | { ok: false; error: UiInteractionDbError };

export type IssueUiInteractionTokenInput = {
  instanceId: string;
  workspaceId: string;
  actorUserId: string;
  request: UiInteractionTokenRequest;
  interactionTokenSecret: string;
  now?: string;
};

export type IssueUiInteractionToken = {
  interactionId: string;
  interactionToken: string;
  expiresAt: string;
};

export type CommitUiInteractionInput = {
  instanceId: string;
  workspaceId: string;
  actorUserId: string;
  interactionId: string;
  interactionToken: string;
  now?: string;
};

export type StoredInteractionResult = {
  interactionId: string;
  state: UiInteractionResult["state"];
  result: SafeJsonValue | null;
  resultRef: string | null;
  renderRevision: number;
  stateRevision: number | null;
  /** Internal dispatch hint; never serialized into the public interaction result. */
  continuationQueueItemId?: string;
};

export type UiInteractionCommitCasInput = {
  interactionState: string;
  tokenExpiresAt: string | Date | null;
  now: string;
  grantAuthorityValid: boolean;
  actionRevokedAt: string | Date | null;
  actionExpiresAt: string | Date;
  actionMaxUses: number | null;
  actionUseCount: number;
  instanceStatus: string;
  currentRenderRevision: number | null;
  interactionRenderRevision: number;
  currentStateRevision: number | null;
  expectedStateRevision: number | null;
  channelStatus: string;
};

export type UiInteractionCommitCasDecision =
  | { status: "proceed" }
  | {
      status: "stale";
      reason:
        | "interaction_not_pending"
        | "token_missing_or_expired"
        | "grant_authority_changed"
        | "grant_revoked_or_expired"
        | "grant_use_limit_reached"
        | "instance_not_ready"
        | "render_revision_changed"
        | "state_revision_changed"
        | "channel_not_active";
      stateRevision: number | null;
    };

/** Pure commit-time CAS decision; SQL still supplies serialization and atomic writes. */
export function evaluateUiInteractionCommitCas(
  input: UiInteractionCommitCasInput,
): UiInteractionCommitCasDecision {
  const stale = (
    reason: Extract<UiInteractionCommitCasDecision, { status: "stale" }>["reason"],
  ): UiInteractionCommitCasDecision => ({
    status: "stale",
    reason,
    stateRevision: input.currentStateRevision,
  });
  if (input.interactionState !== "token_issued") return stale("interaction_not_pending");
  if (!input.tokenExpiresAt || new Date(input.tokenExpiresAt).getTime() <= Date.parse(input.now)) {
    return stale("token_missing_or_expired");
  }
  if (!input.grantAuthorityValid) return stale("grant_authority_changed");
  if (
    input.actionRevokedAt !== null ||
    new Date(input.actionExpiresAt).getTime() <= Date.parse(input.now)
  ) {
    return stale("grant_revoked_or_expired");
  }
  if (input.actionMaxUses !== null && input.actionUseCount >= input.actionMaxUses) {
    return stale("grant_use_limit_reached");
  }
  if (input.instanceStatus !== "ready") return stale("instance_not_ready");
  if (input.currentRenderRevision !== input.interactionRenderRevision) {
    return stale("render_revision_changed");
  }
  if (input.currentStateRevision !== input.expectedStateRevision) {
    return stale("state_revision_changed");
  }
  if (input.channelStatus !== "active") return stale("channel_not_active");
  return { status: "proceed" };
}

function opaqueId(prefix: string): string {
  return `${prefix}_${randomBytes(16).toString("base64url")}`;
}

function hashText(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function hashJson(value: unknown): string {
  return hashText(canonicalizeJson(value));
}

function canonicalJsonEqual(left: unknown, right: unknown): boolean {
  try {
    return canonicalizeJson(left) === canonicalizeJson(right);
  } catch {
    return false;
  }
}

const TOKEN_CIPHERTEXT_PREFIX = "enc:ui-interaction:v1:";

function deriveInteractionTokenKey(secret: string): Buffer {
  return createHash("sha256")
    .update(`forgeroom-ui-interaction-token-v1:${secret}`, "utf8")
    .digest();
}

function sealInteractionToken(token: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveInteractionTokenKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${TOKEN_CIPHERTEXT_PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function openInteractionToken(ciphertext: unknown, secret: string): string | null {
  if (typeof ciphertext !== "string" || !ciphertext.startsWith(TOKEN_CIPHERTEXT_PREFIX)) {
    return null;
  }
  const [ivB64, tagB64, dataB64] = ciphertext.slice(TOKEN_CIPHERTEXT_PREFIX.length).split(".");
  if (!ivB64 || !tagB64 || !dataB64) return null;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveInteractionTokenKey(secret),
      Buffer.from(ivB64, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

function parseStringArray(value: unknown): string[] {
  const parsed = parseJson(value);
  return Array.isArray(parsed)
    ? parsed.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * The P0 registry handlers use a deliberately small JSON-Schema subset. Keeping
 * the validator here avoids accepting a safe JSON value merely because it is
 * syntactically valid JSON; the value must also satisfy the immutable grant
 * schema before the handler is invoked.
 */
const SUPPORTED_SCHEMA_KEYWORDS = new Set([
  "type",
  "enum",
  "const",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "minItems",
  "maxItems",
]);
const SUPPORTED_SCHEMA_TYPES = new Set([
  "object",
  "array",
  "string",
  "number",
  "integer",
  "boolean",
  "null",
]);

function acceptsDeclaredSchemaType(type: unknown): boolean {
  if (typeof type === "string") {
    return SUPPORTED_SCHEMA_TYPES.has(type);
  }
  if (Array.isArray(type)) {
    return (
      type.length > 0 &&
      type.every((entry) => typeof entry === "string" && SUPPORTED_SCHEMA_TYPES.has(entry))
    );
  }
  return false;
}

function isSchemaShape(schema: unknown): schema is Record<string, unknown> {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    return false;
  }
  const record = schema as Record<string, unknown>;
  if (Object.keys(record).some((key) => !SUPPORTED_SCHEMA_KEYWORDS.has(key))) return false;
  if (record.type !== undefined && !acceptsDeclaredSchemaType(record.type)) {
    return false;
  }
  if (record.enum !== undefined && !Array.isArray(record.enum)) return false;
  if (
    record.required !== undefined &&
    (!Array.isArray(record.required) || record.required.some((key) => typeof key !== "string"))
  ) {
    return false;
  }
  for (const key of ["minLength", "maxLength", "minItems", "maxItems"]) {
    const bound = record[key];
    if (
      bound !== undefined &&
      (typeof bound !== "number" || !Number.isSafeInteger(bound) || bound < 0)
    ) {
      return false;
    }
  }
  for (const key of ["minimum", "maximum"]) {
    const bound = record[key];
    if (bound !== undefined && (typeof bound !== "number" || !Number.isFinite(bound))) {
      return false;
    }
  }
  if (
    record.additionalProperties !== undefined &&
    typeof record.additionalProperties !== "boolean" &&
    !isSchemaShape(record.additionalProperties)
  ) {
    return false;
  }
  if (record.items !== undefined && !isSchemaShape(record.items)) return false;
  if (record.properties !== undefined) {
    if (
      typeof record.properties !== "object" ||
      record.properties === null ||
      Array.isArray(record.properties)
    )
      return false;
    if (Object.values(record.properties).some((child) => !isSchemaShape(child))) return false;
  }
  return true;
}

function matchesInputSchema(value: unknown, schema: Record<string, unknown>): boolean {
  if (!isSchemaShape(schema)) {
    return false;
  }
  if (
    Array.isArray(schema.enum) &&
    !schema.enum.some((candidate) => canonicalJsonEqual(candidate, value))
  ) {
    return false;
  }
  if (typeof schema.const !== "undefined" && !canonicalJsonEqual(schema.const, value)) {
    return false;
  }

  const type = schema.type;
  if (type !== undefined) {
    const declaredTypes = Array.isArray(type)
      ? type.filter((entry): entry is string => typeof entry === "string")
      : typeof type === "string"
        ? [type]
        : [];
    if (
      declaredTypes.length > 0 &&
      !declaredTypes.some((entry) => matchesDeclaredJsonType(value, entry))
    ) {
      return false;
    }
  }

  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) return false;
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) return false;
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) return false;
    if (typeof schema.maximum === "number" && value > schema.maximum) return false;
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) return false;
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) return false;
    if (schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)) {
      if (
        !value.every((entry) => matchesInputSchema(entry, schema.items as Record<string, unknown>))
      ) {
        return false;
      }
    }
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const properties =
      schema.properties &&
      typeof schema.properties === "object" &&
      !Array.isArray(schema.properties)
        ? (schema.properties as Record<string, unknown>)
        : {};
    const required = Array.isArray(schema.required)
      ? schema.required.filter((entry): entry is string => typeof entry === "string")
      : [];
    const record = value as Record<string, unknown>;
    if (required.some((key) => !(key in record))) return false;
    const additionalProperties = schema.additionalProperties;
    if (additionalProperties === false) {
      if (Object.keys(record).some((key) => !(key in properties))) return false;
    }
    for (const [key, child] of Object.entries(record)) {
      if (key in properties && child !== undefined) {
        if (
          typeof properties[key] !== "object" ||
          properties[key] === null ||
          Array.isArray(properties[key])
        ) {
          return false;
        }
        if (!matchesInputSchema(child, properties[key] as Record<string, unknown>)) return false;
      } else if (
        !(key in properties) &&
        additionalProperties &&
        typeof additionalProperties === "object" &&
        !matchesInputSchema(child, additionalProperties as Record<string, unknown>)
      ) {
        return false;
      }
    }
  }
  return true;
}

function matchesDeclaredJsonType(value: unknown, type: string): boolean {
  return (
    (type === "object" && typeof value === "object" && value !== null && !Array.isArray(value)) ||
    (type === "array" && Array.isArray(value)) ||
    (type === "string" && typeof value === "string") ||
    (type === "number" && typeof value === "number" && Number.isFinite(value)) ||
    (type === "integer" && typeof value === "number" && Number.isInteger(value)) ||
    (type === "boolean" && typeof value === "boolean") ||
    (type === "null" && value === null)
  );
}

export function validatePropsAgainstParameterSchema(
  props: Record<string, unknown>,
  schema: Record<string, unknown>,
): { ok: true } | { ok: false; message: string } {
  if (!isSchemaShape(schema)) {
    return { ok: false, message: "Component parameter schema is invalid." };
  }
  if (!matchesInputSchema(props, schema)) {
    return { ok: false, message: "Component tool arguments failed schema validation." };
  }
  return { ok: true };
}

function grantMatchesRow(
  grant: ActionGrant,
  row: {
    id: string;
    boundRenderRevision: number | null;
    boundManifestHash: string | null;
    actionRef: string | null;
    handlerKey: string | null;
    actionMode: string | null;
    inputSchemaHash: string | null;
    allowedRenderNodeIds: unknown;
    maxUses: number | null;
    expiresAt: string | Date;
    revokedAt: string | Date | null;
    linkedDataGrantId?: string | null;
    componentInterruptId?: string | null;
  },
): boolean {
  const modeMatches =
    grant.mode === row.actionMode &&
    (grant.mode !== "server_read" ||
      (grant.data_grant_id === row.linkedDataGrantId && grant.data_ref.length > 0)) &&
    (grant.mode !== "complete_component_interrupt" ||
      grant.component_interrupt_id === row.componentInterruptId);
  return (
    modeMatches &&
    grant.id === row.id &&
    grant.bound_render_revision === row.boundRenderRevision &&
    grant.bound_manifest_hash === row.boundManifestHash &&
    grant.action_ref === row.actionRef &&
    grant.handler_key === row.handlerKey &&
    grant.mode === row.actionMode &&
    grant.input_schema_hash === row.inputSchemaHash &&
    grant.max_uses === row.maxUses &&
    new Date(grant.expires_at).getTime() === new Date(row.expiresAt).getTime() &&
    (grant.revoked_at === null) === (row.revokedAt === null) &&
    hashJson(grant.input_schema) === grant.input_schema_hash &&
    JSON.stringify(grant.allowed_render_node_ids) ===
      JSON.stringify(parseStringArray(row.allowedRenderNodeIds))
  );
}

function terminalResult(row: {
  interaction_id: string;
  state: string;
  result_redacted_json: unknown;
  result_ref: string | null;
  render_revision: number;
  state_revision: number | null;
}): StoredInteractionResult | null {
  if (!(["succeeded", "failed", "denied", "stale"] as const).includes(row.state as never)) {
    return null;
  }
  const parsed = safeJsonValueSchema.nullable().safeParse(parseJson(row.result_redacted_json));
  if (!parsed.success) {
    return null;
  }
  return {
    interactionId: row.interaction_id,
    state: row.state as StoredInteractionResult["state"],
    result: parsed.data,
    resultRef: row.result_ref,
    renderRevision: row.render_revision,
    stateRevision:
      parsed.data &&
      typeof parsed.data === "object" &&
      !Array.isArray(parsed.data) &&
      typeof parsed.data.stateRevision === "number"
        ? parsed.data.stateRevision
        : row.state_revision,
  };
}

export async function issueUiInteractionToken(
  sql: SqlClient,
  input: IssueUiInteractionTokenInput,
): Promise<UiInteractionDbResult<IssueUiInteractionToken>> {
  const now = input.now ?? new Date().toISOString();
  const parsedRequest = uiInteractionTokenRequestSchema.safeParse(input.request);
  if (!parsedRequest.success) {
    return {
      ok: false,
      error: { code: "validation_failed", message: "Interaction token request is invalid." },
    };
  }
  const request = parsedRequest.data;
  if (!input.interactionTokenSecret) {
    return {
      ok: false,
      error: { code: "validation_failed", message: "Interaction token secret is not configured." },
    };
  }
  const idempotencyKeyHash = hashText(`${input.actorUserId}\u0000${request.idempotencyKey}`);

  return sql.begin(async (tx) => {
    const instances = await tx<
      {
        id: string;
        workspace_id: string;
        channel_id: string;
        channel_status: string;
        render_grant_id: string | null;
        status: string;
        current_render_revision: number | null;
        current_state_revision: number | null;
      }[]
    >`
      SELECT ui_instances.id, ui_instances.workspace_id, ui_instances.channel_id,
             ui_instances.render_grant_id, ui_instances.status,
             ui_instances.current_render_revision, ui_instances.current_state_revision,
             channels.status AS channel_status
      FROM ui_instances
      JOIN channels ON channels.id = ui_instances.channel_id
      WHERE ui_instances.id = ${input.instanceId}
      FOR SHARE
    `;
    const instance = instances[0];
    if (!instance) {
      return { ok: false, error: { code: "not_found", message: "UIInstance not found." } };
    }
    if (instance.workspace_id !== input.workspaceId) {
      return {
        ok: false,
        error: { code: "forbidden", message: "UIInstance is outside this workspace." },
      };
    }
    if (request.surfaceId !== instance.id) {
      return {
        ok: false,
        error: { code: "ui_interaction_not_allowed", message: "Surface binding is invalid." },
      };
    }

    // Serialize issuance for one ActionGrant even when no idempotency row
    // exists yet, so concurrent first attempts cannot race the unique key.
    const grantLocks = await tx<{ id: string }[]>`
      SELECT id
      FROM ui_surface_grants
      WHERE id = ${request.actionGrantId}
        AND ui_instance_id = ${instance.id}
        AND grant_kind = 'action'
      FOR UPDATE
    `;
    if (!grantLocks[0]) {
      return { ok: false, error: { code: "not_found", message: "ActionGrant not found." } };
    }

    const priorRows = await tx<
      {
        id: string;
        ui_instance_id: string;
        actor_user_id: string;
        render_revision: number;
        expected_state_revision: number | null;
        render_node_id: string;
        intent_name: string;
        payload_hash: string;
        interaction_token_ciphertext: string | null;
        token_expires_at: string | Date | null;
      }[]
    >`
      SELECT id, ui_instance_id, actor_user_id, render_revision, expected_state_revision,
             render_node_id, intent_name, payload_hash, interaction_token_ciphertext,
             token_expires_at
      FROM ui_interactions
      WHERE action_grant_id = ${request.actionGrantId}
        AND idempotency_key_hash = ${idempotencyKeyHash}
      FOR UPDATE
    `;
    const prior = priorRows[0];
    if (prior) {
      if (prior.ui_instance_id !== instance.id || prior.actor_user_id !== input.actorUserId) {
        return {
          ok: false,
          error: {
            code: "forbidden",
            message: "Interaction idempotency key is not owned by this session.",
          },
        };
      }
      if (
        prior.render_revision !== request.renderRevision ||
        prior.expected_state_revision !== request.expectedStateRevision ||
        prior.render_node_id !== request.renderNodeId ||
        prior.intent_name !== request.actionRef ||
        prior.payload_hash !== hashJson(request.input)
      ) {
        return {
          ok: false,
          error: {
            code: "conflict",
            message: "Idempotency key was reused with different interaction input.",
          },
        };
      }
      const interactionToken = openInteractionToken(
        prior.interaction_token_ciphertext,
        input.interactionTokenSecret,
      );
      if (!interactionToken || !prior.token_expires_at) {
        return {
          ok: false,
          error: {
            code: "conflict",
            message: "Original interaction token is unavailable for retry.",
          },
        };
      }
      return {
        ok: true,
        value: {
          interactionId: prior.id,
          interactionToken,
          expiresAt: new Date(prior.token_expires_at).toISOString(),
        },
      };
    }
    if (instance.channel_status !== "active") {
      return {
        ok: false,
        error: {
          code: "ui_interaction_not_allowed",
          message: "Channel interactions are disabled.",
        },
      };
    }
    if (
      instance.status !== "ready" ||
      instance.current_render_revision === null ||
      request.renderRevision !== instance.current_render_revision
    ) {
      return {
        ok: false,
        error: { code: "ui_instance_stale", message: "UIInstance render revision is stale." },
      };
    }
    if (request.expectedStateRevision !== instance.current_state_revision) {
      return {
        ok: false,
        error: { code: "ui_instance_stale", message: "UIInstance state revision is stale." },
      };
    }

    if (!instance.render_grant_id) {
      return {
        ok: false,
        error: { code: "ui_interaction_not_allowed", message: "Render authority is missing." },
      };
    }
    const renderGrants = await tx<
      { revoked_at: string | Date | null; expires_at: string | Date }[]
    >`
      SELECT revoked_at, expires_at
      FROM ui_surface_grants
      WHERE id = ${instance.render_grant_id}
        AND ui_instance_id = ${instance.id}
        AND grant_kind = 'render'
      FOR SHARE
    `;
    const renderGrant = renderGrants[0];
    if (
      !renderGrant ||
      renderGrant.revoked_at !== null ||
      new Date(renderGrant.expires_at).getTime() <= Date.parse(now)
    ) {
      return {
        ok: false,
        error: { code: "ui_interaction_not_allowed", message: "Render authority is inactive." },
      };
    }

    const revisions = await tx<{ manifest_hash: string | null }[]>`
      SELECT manifest_hash
      FROM ui_instance_revisions
      WHERE ui_instance_id = ${instance.id}
        AND revision_kind = 'render'
        AND revision = ${instance.current_render_revision}
        AND validation_state = 'valid'
        AND promoted_at IS NOT NULL
      LIMIT 1
    `;
    const revision = revisions[0];
    if (!revision?.manifest_hash) {
      return {
        ok: false,
        error: { code: "ui_instance_stale", message: "UIInstance render revision is unavailable." },
      };
    }

    const grants = await tx<
      {
        id: string;
        bound_render_revision: number | null;
        bound_manifest_hash: string | null;
        action_ref: string | null;
        handler_key: string | null;
        action_mode: string | null;
        input_schema_hash: string | null;
        allowed_render_node_ids_json: unknown;
        input_schema_json: unknown;
        grant_body_redacted_json: unknown;
        linked_data_grant_id: string | null;
        component_interrupt_id: string | null;
        max_uses: number | null;
        use_count: number;
        expires_at: string | Date;
        revoked_at: string | Date | null;
      }[]
    >`
      SELECT id, bound_render_revision, bound_manifest_hash, action_ref, handler_key,
             action_mode, input_schema_hash, input_schema_json, allowed_render_node_ids_json,
             grant_body_redacted_json, linked_data_grant_id, component_interrupt_id,
             max_uses, use_count, expires_at, revoked_at
      FROM ui_surface_grants
      WHERE id = ${input.request.actionGrantId}
        AND ui_instance_id = ${instance.id}
        AND grant_kind = 'action'
      FOR UPDATE
    `;
    const grant = grants[0];
    if (!grant) {
      return { ok: false, error: { code: "not_found", message: "ActionGrant not found." } };
    }
    const interpretedGrant = interpretP0ActionGrant(parseJson(grant.grant_body_redacted_json));
    if (!interpretedGrant.ok) {
      return {
        ok: false,
        error: {
          code: "ui_interaction_not_allowed",
          message: "ActionGrant mode is unsupported in P0.",
        },
      };
    }
    const parsedGrant = actionGrantSchema.safeParse(interpretedGrant.grant);
    const persistedInputSchema = safeJsonObjectSchema.safeParse(parseJson(grant.input_schema_json));
    if (
      !parsedGrant.success ||
      !persistedInputSchema.success ||
      (parsedGrant.success &&
        (parsedGrant.data.workspace_id !== input.workspaceId ||
          parsedGrant.data.channel_id !== instance.channel_id ||
          parsedGrant.data.surface_id !== instance.id)) ||
      !grantMatchesRow(parsedGrant.data, {
        id: grant.id,
        boundRenderRevision: grant.bound_render_revision,
        boundManifestHash: grant.bound_manifest_hash,
        actionRef: grant.action_ref,
        handlerKey: grant.handler_key,
        actionMode: grant.action_mode,
        inputSchemaHash: grant.input_schema_hash,
        allowedRenderNodeIds: grant.allowed_render_node_ids_json,
        maxUses: grant.max_uses,
        expiresAt: grant.expires_at,
        revokedAt: grant.revoked_at,
        linkedDataGrantId: grant.linked_data_grant_id,
        componentInterruptId: grant.component_interrupt_id,
      }) ||
      canonicalizeJson(parsedGrant.data.input_schema) !==
        canonicalizeJson(persistedInputSchema.data)
    ) {
      return {
        ok: false,
        error: { code: "ui_interaction_not_allowed", message: "ActionGrant authority is invalid." },
      };
    }
    const actionGrant = parsedGrant.data;
    const commonBindingInvalid =
      grant.bound_render_revision !== instance.current_render_revision ||
      grant.bound_manifest_hash !== revision.manifest_hash ||
      grant.action_ref !== request.actionRef ||
      !grant.handler_key ||
      !grant.input_schema_hash ||
      !parseStringArray(grant.allowed_render_node_ids_json).includes(request.renderNodeId) ||
      !actionGrant.allowed_render_node_ids.includes(request.renderNodeId) ||
      !matchesInputSchema(request.input, actionGrant.input_schema);
    if (commonBindingInvalid) {
      return {
        ok: false,
        error: { code: "ui_interaction_not_allowed", message: "ActionGrant binding is invalid." },
      };
    }
    if (actionGrant.mode === "server_read") {
      const linkedDataGrant = await loadRetainedDataGrantSnapshot(tx, {
        uiInstanceId: instance.id,
        dataGrantId: actionGrant.data_grant_id,
        expectedRenderRevision: instance.current_render_revision,
        expectedManifestHash: revision.manifest_hash,
        expectedDataRef: actionGrant.data_ref,
        now,
      });
      if (!linkedDataGrant.ok) {
        return {
          ok: false,
          error: {
            code: linkedDataGrant.code === "not_found" ? "not_found" : "ui_interaction_not_allowed",
            message: linkedDataGrant.message,
          },
        };
      }
    }
    if (actionGrant.mode === "complete_component_interrupt") {
      const interrupts = await tx<{ id: string; state: string }[]>`
        SELECT id, state
        FROM ui_component_interrupts
        WHERE id = ${actionGrant.component_interrupt_id}
          AND ui_instance_id = ${instance.id}
          AND action_grant_id = ${grant.id}
        FOR UPDATE
      `;
      const interrupt = interrupts[0];
      if (!interrupt || interrupt.state !== "waiting") {
        return {
          ok: false,
          error: {
            code: "ui_interaction_not_allowed",
            message: "Component interrupt is not waiting for resolution.",
          },
        };
      }
    }
    if (
      grant.revoked_at !== null ||
      new Date(grant.expires_at).getTime() <= Date.parse(now) ||
      (grant.max_uses !== null && grant.use_count >= grant.max_uses)
    ) {
      return {
        ok: false,
        error: { code: "ui_interaction_not_allowed", message: "ActionGrant is inactive." },
      };
    }

    const expiresAt = new Date(
      Math.min(new Date(grant.expires_at).getTime(), Date.parse(now) + 5 * 60 * 1_000),
    ).toISOString();
    const interactionId = opaqueId("interaction");
    const interactionToken = randomBytes(32).toString("base64url");
    const interactionTokenHash = hashText(interactionToken);
    const interactionTokenCiphertext = sealInteractionToken(
      interactionToken,
      input.interactionTokenSecret,
    );
    const payloadHash = hashJson(request.input);
    await tx`
      INSERT INTO ui_interactions (
        id, ui_instance_id, render_revision, expected_state_revision, action_grant_id,
        render_node_id, handler_key, intent_name, payload_redacted_json, payload_hash,
        interaction_token_hash, interaction_token_ciphertext, idempotency_key_hash,
        token_expires_at, actor_user_id,
        client_kind, state, created_at
      ) VALUES (
        ${interactionId}, ${instance.id}, ${instance.current_render_revision},
        ${instance.current_state_revision}, ${grant.id}, ${input.request.renderNodeId},
        ${grant.handler_key}, ${grant.action_ref}, ${JSON.stringify(request.input)}::jsonb,
        ${payloadHash}, ${interactionTokenHash}, ${interactionTokenCiphertext},
        ${idempotencyKeyHash}, ${expiresAt},
        ${input.actorUserId}, 'registry', 'token_issued', ${now}
      )
    `;
    return { ok: true, value: { interactionId, interactionToken, expiresAt } };
  });
}

export async function commitUiInteraction(
  sql: SqlClient,
  input: CommitUiInteractionInput,
): Promise<UiInteractionDbResult<StoredInteractionResult & { interactionId: string }>> {
  const now = input.now ?? new Date().toISOString();
  const tokenHash = hashText(input.interactionToken);

  return sql.begin(async (tx) => {
    // Serialize every commit for one surface before reading its state pointer.
    // This makes the compare-and-swap outcome deterministic for different
    // interaction rows that share the same UIInstance.
    const instanceLocks = await tx<{ id: string }[]>`
      SELECT id
      FROM ui_instances
      WHERE id = ${input.instanceId}
      FOR UPDATE
    `;
    if (!instanceLocks[0]) {
      return { ok: false, error: { code: "not_found", message: "UIInstance not found." } };
    }
    const rows = await tx<
      {
        interaction_id: string;
        ui_instance_id: string;
        workspace_id: string;
        channel_id: string;
        channel_status: string;
        actor_user_id: string;
        render_revision: number;
        expected_state_revision: number | null;
        action_grant_id: string;
        render_node_id: string;
        handler_key: string;
        intent_name: string;
        payload_redacted_json: unknown;
        interaction_token_hash: string | null;
        token_expires_at: string | Date | null;
        bound_render_revision: number | null;
        bound_manifest_hash: string | null;
        action_ref: string | null;
        input_schema_hash: string | null;
        input_schema_json: unknown;
        allowed_render_node_ids_json: unknown;
        grant_body_redacted_json: unknown;
        grant_policy_revision: number;
        grant_scope_hash: string;
        grant_issued_by: string;
        action_mode: string | null;
        action_expires_at: string | Date;
        action_revoked_at: string | Date | null;
        action_max_uses: number | null;
        action_use_count: number;
        linked_data_grant_id: string | null;
        component_interrupt_id: string | null;
        run_step_id: string;
        channel_agent_session_id: string;
        session_generation_id: string;
        current_render_revision: number | null;
        current_state_revision: number | null;
        current_manifest_hash: string | null;
        status: string;
        state: string;
        result_redacted_json: unknown;
        result_ref: string | null;
        interaction_state_revision: number | null;
      }[]
    >`
      SELECT
        i.id AS interaction_id, i.ui_instance_id, ui.workspace_id, ui.channel_id,
        ch.status AS channel_status,
        i.actor_user_id,
        i.render_revision, i.expected_state_revision, i.action_grant_id, i.render_node_id,
        i.handler_key, i.intent_name, i.payload_redacted_json, i.interaction_token_hash,
        i.token_expires_at,
        g.bound_render_revision, g.bound_manifest_hash, g.action_ref, g.input_schema_hash,
        g.input_schema_json, g.allowed_render_node_ids_json, g.grant_body_redacted_json,
        g.policy_revision AS grant_policy_revision, g.grant_scope_hash,
        g.issued_by AS grant_issued_by,
        g.action_mode, g.expires_at AS action_expires_at, g.revoked_at AS action_revoked_at,
        g.max_uses AS action_max_uses, g.use_count AS action_use_count,
        g.linked_data_grant_id, g.component_interrupt_id,
        ui.run_step_id, at.channel_agent_session_id, at.session_generation_id,
        ui.current_render_revision, ui.current_state_revision,
        (
          SELECT r.manifest_hash
          FROM ui_instance_revisions AS r
          WHERE r.ui_instance_id = ui.id
            AND r.revision_kind = 'render'
            AND r.revision = ui.current_render_revision
            AND r.validation_state = 'valid'
            AND r.promoted_at IS NOT NULL
          LIMIT 1
        ) AS current_manifest_hash,
        ui.status, i.state,
        i.result_redacted_json, i.result_ref, i.expected_state_revision AS interaction_state_revision
      FROM ui_interactions AS i
      JOIN ui_instances AS ui ON ui.id = i.ui_instance_id
      JOIN channels AS ch ON ch.id = ui.channel_id
      JOIN ui_surface_grants AS g ON g.id = i.action_grant_id
      JOIN agent_turns AS at ON at.id = ui.agent_turn_id
      WHERE i.id = ${input.interactionId}
        AND i.ui_instance_id = ${input.instanceId}
      FOR UPDATE OF i, ui, g, ch, at
    `;
    const row = rows[0];
    if (!row) {
      return { ok: false, error: { code: "not_found", message: "Interaction not found." } };
    }
    if (row.workspace_id !== input.workspaceId || row.actor_user_id !== input.actorUserId) {
      return {
        ok: false,
        error: { code: "forbidden", message: "Interaction is not owned by this session." },
      };
    }
    if (row.interaction_token_hash !== tokenHash) {
      return { ok: false, error: { code: "forbidden", message: "Interaction token is invalid." } };
    }
    const interpretedGrant = interpretP0ActionGrant(parseJson(row.grant_body_redacted_json));
    if (!interpretedGrant.ok) {
      return {
        ok: false,
        error: {
          code: "ui_interaction_not_allowed",
          message: "ActionGrant mode is unsupported in P0.",
        },
      };
    }
    const parsedGrant = actionGrantSchema.safeParse(interpretedGrant.grant);
    const persistedInputSchema = safeJsonObjectSchema.safeParse(parseJson(row.input_schema_json));
    const grantAuthorityValid =
      parsedGrant.success &&
      persistedInputSchema.success &&
      parsedGrant.data.workspace_id === input.workspaceId &&
      parsedGrant.data.channel_id === row.channel_id &&
      parsedGrant.data.surface_id === row.ui_instance_id &&
      parsedGrant.data.policy_revision === row.grant_policy_revision &&
      parsedGrant.data.issued_by === row.grant_issued_by &&
      parsedGrant.data.grant_scope_hash === row.grant_scope_hash &&
      grantMatchesRow(parsedGrant.data, {
        id: row.action_grant_id,
        boundRenderRevision: row.bound_render_revision,
        boundManifestHash: row.bound_manifest_hash,
        actionRef: row.action_ref,
        handlerKey: row.handler_key,
        actionMode: row.action_mode,
        inputSchemaHash: row.input_schema_hash,
        allowedRenderNodeIds: row.allowed_render_node_ids_json,
        maxUses: row.action_max_uses,
        expiresAt: row.action_expires_at,
        revokedAt: row.action_revoked_at,
        linkedDataGrantId: row.linked_data_grant_id,
        componentInterruptId: row.component_interrupt_id,
      }) &&
      canonicalizeJson(parsedGrant.data.input_schema) ===
        canonicalizeJson(persistedInputSchema.data) &&
      row.bound_render_revision === row.render_revision &&
      row.bound_manifest_hash === row.current_manifest_hash &&
      parsedGrant.data.action_ref === row.intent_name &&
      parsedGrant.data.handler_key === row.handler_key &&
      parsedGrant.data.allowed_render_node_ids.includes(row.render_node_id);
    const prior = terminalResult({
      interaction_id: row.interaction_id,
      state: row.state,
      result_redacted_json: row.result_redacted_json,
      result_ref: row.result_ref,
      render_revision: row.render_revision,
      state_revision: row.interaction_state_revision,
    });
    if (prior) {
      return { ok: true, value: { ...prior, interactionId: row.interaction_id } };
    }
    const cas = evaluateUiInteractionCommitCas({
      interactionState: row.state,
      tokenExpiresAt: row.token_expires_at,
      now,
      grantAuthorityValid,
      actionRevokedAt: row.action_revoked_at,
      actionExpiresAt: row.action_expires_at,
      actionMaxUses: row.action_max_uses,
      actionUseCount: row.action_use_count,
      instanceStatus: row.status,
      currentRenderRevision: row.current_render_revision,
      interactionRenderRevision: row.render_revision,
      currentStateRevision: row.current_state_revision,
      expectedStateRevision: row.expected_state_revision,
      channelStatus: row.channel_status,
    });
    if (cas.status === "stale") {
      const staleInteractionState = transitionUiInteraction("token_issued", "stale");
      await tx`
        UPDATE ui_interactions
        SET state = ${staleInteractionState}, consumed_at = ${now},
            result_redacted_json = ${JSON.stringify({ stateRevision: row.current_state_revision })}::jsonb
        WHERE id = ${row.interaction_id} AND state = 'token_issued'
      `;
      return {
        ok: true,
        value: {
          interactionId: row.interaction_id,
          state: "stale",
          result: { stateRevision: row.current_state_revision },
          resultRef: null,
          renderRevision: row.render_revision,
          stateRevision: row.current_state_revision,
        },
      };
    }
    if (
      row.action_mode !== "local_state" &&
      row.action_mode !== "server_read" &&
      row.action_mode !== "complete_component_interrupt"
    ) {
      return {
        ok: false,
        error: {
          code: "ui_interaction_not_allowed",
          message: "This interaction mode is not enabled yet.",
        },
      };
    }

    const actionGrant = parsedGrant.success ? parsedGrant.data : null;
    if (!actionGrant) {
      return {
        ok: false,
        error: { code: "ui_interaction_not_allowed", message: "ActionGrant authority is invalid." },
      };
    }
    const payloadInput = parseJson(row.payload_redacted_json) as SafeJsonValue;
    let result: SafeJsonValue;
    let resultRef: string | null = null;
    let continuationQueueItemId: string | undefined;
    let nextStateRevision = row.current_state_revision;

    if (row.action_mode === "local_state") {
      nextStateRevision = (row.current_state_revision ?? -1) + 1;
      const state = {
        lastInteraction: {
          actionRef: row.intent_name,
          renderNodeId: row.render_node_id,
          input: payloadInput,
        },
      };
      const stateHash = hashJson(state);
      resultRef = opaqueId("uirev");
      await tx`
        INSERT INTO ui_instance_revisions (
          id, ui_instance_id, revision_kind, revision, base_revision,
          validator_policy_version, state_schema_hash, scoped_state_json,
          scoped_state_hash, content_hash, validation_state, created_at, promoted_at
        ) VALUES (
          ${resultRef}, ${row.ui_instance_id}, 'state', ${nextStateRevision},
          ${row.current_state_revision}, 'registry_v1', ${hashText("registry_v1-state-v1")},
          ${JSON.stringify(state)}::jsonb, ${stateHash}, ${stateHash}, 'valid', ${now}, ${now}
        )
      `;
      await tx`
        UPDATE ui_instances
        SET current_state_revision = ${nextStateRevision}, updated_at = ${now}
        WHERE id = ${row.ui_instance_id}
          AND current_state_revision IS NOT DISTINCT FROM ${row.current_state_revision}
      `;
      result = { stateRevision: nextStateRevision };
    } else if (row.action_mode === "server_read") {
      if (actionGrant.mode !== "server_read" || !row.current_manifest_hash) {
        return {
          ok: false,
          error: { code: "ui_interaction_not_allowed", message: "ActionGrant binding is invalid." },
        };
      }
      const retained = await loadRetainedDataGrantSnapshot(tx, {
        uiInstanceId: row.ui_instance_id,
        dataGrantId: actionGrant.data_grant_id,
        expectedRenderRevision: row.render_revision,
        expectedManifestHash: row.current_manifest_hash,
        expectedDataRef: actionGrant.data_ref,
        now,
      });
      if (!retained.ok) {
        return {
          ok: false,
          error: {
            code: retained.code === "not_found" ? "not_found" : "ui_interaction_not_allowed",
            message: retained.message,
          },
        };
      }
      try {
        const data = resolveRetainedDataGrantRead({
          snapshot: retained.snapshot,
          dataGrant: retained.dataGrant,
          allowedSelectionPaths: actionGrant.allowed_selection_paths,
        });
        const parsedData = safeJsonValueSchema.safeParse(data);
        if (!parsedData.success) {
          return {
            ok: false,
            error: {
              code: "ui_interaction_not_allowed",
              message: "Retained data read produced an invalid JSON value.",
            },
          };
        }
        result = { dataRef: actionGrant.data_ref, data: parsedData.data };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: "ui_interaction_not_allowed",
            message: error instanceof Error ? error.message : "Retained data read failed.",
          },
        };
      }
      await tx`
        UPDATE ui_surface_grants
        SET use_count = use_count + 1
        WHERE id = ${actionGrant.data_grant_id}
          AND revoked_at IS NULL
          AND expires_at > ${now}
          AND (max_uses IS NULL OR use_count < max_uses)
      `;
    } else {
      if (
        actionGrant.mode !== "complete_component_interrupt" ||
        !row.component_interrupt_id ||
        actionGrant.component_interrupt_id !== row.component_interrupt_id
      ) {
        return {
          ok: false,
          error: { code: "ui_interaction_not_allowed", message: "ActionGrant binding is invalid." },
        };
      }
      const interrupts = await tx<
        {
          id: string;
          state: string;
          session_generation_id: string;
          result_redacted_json: unknown;
        }[]
      >`
        SELECT id, state, session_generation_id, result_redacted_json
        FROM ui_component_interrupts
        WHERE id = ${actionGrant.component_interrupt_id}
          AND ui_instance_id = ${row.ui_instance_id}
          AND action_grant_id = ${row.action_grant_id}
        FOR UPDATE
      `;
      const interrupt = interrupts[0];
      if (
        !interrupt ||
        interrupt.state !== "waiting" ||
        interrupt.session_generation_id !== row.session_generation_id
      ) {
        return {
          ok: false,
          error: {
            code: "ui_interaction_not_allowed",
            message: "Component interrupt is not waiting for resolution.",
          },
        };
      }
      const resultHash = hashJson(payloadInput);
      await tx`
        UPDATE ui_component_interrupts
        SET result_redacted_json = ${JSON.stringify(payloadInput)}::jsonb,
            result_hash = ${resultHash}
        WHERE id = ${interrupt.id}
          AND state = 'waiting'
      `;
      const continuation = await enqueueComponentInterruptContinuationInTx(tx, {
        interactionId: row.interaction_id,
        uiInstanceId: row.ui_instance_id,
        interruptId: interrupt.id,
        runStepId: row.run_step_id,
        channelAgentSessionId: row.channel_agent_session_id,
        sessionGenerationId: row.session_generation_id,
        now,
      });
      if (!continuation.ok) {
        return {
          ok: false,
          error: { code: "conflict", message: continuation.message },
        };
      }
      result = payloadInput;
      resultRef = continuation.queueItemId;
      continuationQueueItemId = continuation.queueItemId;
    }

    await tx`
      UPDATE ui_surface_grants
      SET use_count = use_count + 1
      WHERE id = ${row.action_grant_id}
        AND revoked_at IS NULL
        AND expires_at > ${now}
        AND (max_uses IS NULL OR use_count < max_uses)
    `;
    await tx`
      UPDATE ui_interactions
      SET state = 'succeeded', result_redacted_json = ${JSON.stringify(result)}::jsonb,
          result_ref = ${resultRef}, consumed_at = ${now}
      WHERE id = ${row.interaction_id} AND state = 'token_issued'
    `;
    return {
      ok: true,
      value: {
        interactionId: row.interaction_id,
        state: "succeeded",
        result,
        resultRef,
        renderRevision: row.render_revision,
        stateRevision: nextStateRevision,
        ...(continuationQueueItemId ? { continuationQueueItemId } : {}),
      },
    };
  });
}
