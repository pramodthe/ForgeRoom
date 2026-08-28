import { createHash, randomBytes } from "node:crypto";
import type postgres from "postgres";
import { canonicalizeJson } from "@forgeroom/domain";
import type {
  ActionGrant,
  SafeJsonValue,
  UiInteractionResult,
  UiInteractionTokenRequest,
} from "@forgeroom/contracts";
import {
  actionGrantSchema,
  safeJsonValueSchema,
  safeJsonObjectSchema,
  uiInteractionTokenRequestSchema,
} from "@forgeroom/contracts";

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
};

function opaqueId(prefix: string): string {
  return `${prefix}_${randomBytes(16).toString("base64url")}`;
}

function hashText(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function hashJson(value: unknown): string {
  return hashText(canonicalizeJson(value));
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

function isSchemaShape(schema: unknown): schema is Record<string, unknown> {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    return false;
  }
  const record = schema as Record<string, unknown>;
  if (Object.keys(record).some((key) => !SUPPORTED_SCHEMA_KEYWORDS.has(key))) return false;
  if (record.type !== undefined && typeof record.type !== "string") return false;
  if (record.enum !== undefined && !Array.isArray(record.enum)) return false;
  if (
    record.required !== undefined &&
    (!Array.isArray(record.required) || record.required.some((key) => typeof key !== "string"))
  ) {
    return false;
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
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => Object.is(candidate, value))) {
    return false;
  }
  if (typeof schema.const !== "undefined" && !Object.is(schema.const, value)) {
    return false;
  }

  const type = schema.type;
  if (typeof type === "string") {
    const typeMatches =
      (type === "object" && typeof value === "object" && value !== null && !Array.isArray(value)) ||
      (type === "array" && Array.isArray(value)) ||
      (type === "string" && typeof value === "string") ||
      (type === "number" && typeof value === "number" && Number.isFinite(value)) ||
      (type === "integer" && typeof value === "number" && Number.isInteger(value)) ||
      (type === "boolean" && typeof value === "boolean") ||
      (type === "null" && value === null);
    if (!typeMatches) {
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
  },
): boolean {
  return (
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
  const interactionId = opaqueId("interaction");
  const interactionToken = randomBytes(32).toString("base64url");
  const interactionTokenHash = hashText(interactionToken);
  const idempotencyKeyHash = hashText(interactionId);

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
    if (instance.channel_status !== "active") {
      return {
        ok: false,
        error: {
          code: "ui_interaction_not_allowed",
          message: "Channel interactions are disabled.",
        },
      };
    }
    if (request.surfaceId !== instance.id) {
      return {
        ok: false,
        error: { code: "ui_interaction_not_allowed", message: "Surface binding is invalid." },
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
        max_uses: number | null;
        use_count: number;
        expires_at: string | Date;
        revoked_at: string | Date | null;
      }[]
    >`
      SELECT id, bound_render_revision, bound_manifest_hash, action_ref, handler_key,
             action_mode, input_schema_hash, input_schema_json, allowed_render_node_ids_json,
             grant_body_redacted_json,
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
    const parsedGrant = actionGrantSchema.safeParse(parseJson(grant.grant_body_redacted_json));
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
    if (
      grant.bound_render_revision !== instance.current_render_revision ||
      grant.bound_manifest_hash !== revision.manifest_hash ||
      grant.action_ref !== request.actionRef ||
      grant.action_mode !== "local_state" ||
      !grant.handler_key ||
      !grant.input_schema_hash ||
      !parseStringArray(grant.allowed_render_node_ids_json).includes(request.renderNodeId) ||
      !actionGrant.allowed_render_node_ids.includes(request.renderNodeId) ||
      !matchesInputSchema(request.input, actionGrant.input_schema)
    ) {
      return {
        ok: false,
        error: { code: "ui_interaction_not_allowed", message: "ActionGrant binding is invalid." },
      };
    }
    if (grant.revoked_at !== null || new Date(grant.expires_at).getTime() <= Date.parse(now)) {
      return {
        ok: false,
        error: { code: "ui_interaction_not_allowed", message: "ActionGrant is inactive." },
      };
    }
    if (grant.max_uses === null || grant.use_count >= grant.max_uses) {
      return {
        ok: false,
        error: { code: "ui_interaction_not_allowed", message: "ActionGrant usage limit reached." },
      };
    }

    const expiresAt = new Date(
      Math.min(new Date(grant.expires_at).getTime(), Date.parse(now) + 5 * 60 * 1_000),
    ).toISOString();
    const payloadHash = hashJson(request.input);
    await tx`
      INSERT INTO ui_interactions (
        id, ui_instance_id, render_revision, expected_state_revision, action_grant_id,
        render_node_id, handler_key, intent_name, payload_redacted_json, payload_hash,
        interaction_token_hash, idempotency_key_hash, token_expires_at, actor_user_id,
        client_kind, state, created_at
      ) VALUES (
        ${interactionId}, ${instance.id}, ${instance.current_render_revision},
        ${instance.current_state_revision}, ${grant.id}, ${input.request.renderNodeId},
        ${grant.handler_key}, ${grant.action_ref}, ${JSON.stringify(request.input)}::jsonb,
        ${payloadHash}, ${interactionTokenHash}, ${idempotencyKeyHash}, ${expiresAt},
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
        action_mode: string | null;
        action_expires_at: string | Date;
        action_revoked_at: string | Date | null;
        action_max_uses: number | null;
        action_use_count: number;
        current_render_revision: number | null;
        current_state_revision: number | null;
        status: string;
        state: string;
        result_redacted_json: unknown;
        result_ref: string | null;
        interaction_state_revision: number | null;
      }[]
    >`
      SELECT
        i.id AS interaction_id, i.ui_instance_id, ui.workspace_id, ch.status AS channel_status,
        i.actor_user_id,
        i.render_revision, i.expected_state_revision, i.action_grant_id, i.render_node_id,
        i.handler_key, i.intent_name, i.payload_redacted_json, i.interaction_token_hash,
        i.token_expires_at,
        g.action_mode, g.expires_at AS action_expires_at, g.revoked_at AS action_revoked_at,
        g.max_uses AS action_max_uses, g.use_count AS action_use_count,
        ui.current_render_revision, ui.current_state_revision, ui.status, i.state,
        i.result_redacted_json, i.result_ref, i.expected_state_revision AS interaction_state_revision
      FROM ui_interactions AS i
      JOIN ui_instances AS ui ON ui.id = i.ui_instance_id
      JOIN channels AS ch ON ch.id = ui.channel_id
      JOIN ui_surface_grants AS g ON g.id = i.action_grant_id
      WHERE i.id = ${input.interactionId}
        AND i.ui_instance_id = ${input.instanceId}
      FOR UPDATE OF i, ui, g, ch
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
    if (
      row.state !== "token_issued" ||
      !row.token_expires_at ||
      new Date(row.token_expires_at).getTime() <= Date.parse(now) ||
      row.action_revoked_at !== null ||
      new Date(row.action_expires_at).getTime() <= Date.parse(now) ||
      row.action_max_uses === null ||
      row.action_use_count >= row.action_max_uses ||
      row.status !== "ready" ||
      row.current_render_revision !== row.render_revision ||
      row.current_state_revision !== row.expected_state_revision ||
      row.channel_status !== "active"
    ) {
      await tx`
        UPDATE ui_interactions
        SET state = 'stale', consumed_at = ${now},
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
    if (row.action_mode !== "local_state") {
      return {
        ok: false,
        error: {
          code: "ui_interaction_not_allowed",
          message: "This interaction mode is not enabled yet.",
        },
      };
    }

    const nextStateRevision = (row.current_state_revision ?? -1) + 1;
    const state = {
      lastInteraction: {
        actionRef: row.intent_name,
        renderNodeId: row.render_node_id,
        input: parseJson(row.payload_redacted_json) as SafeJsonValue,
      },
    };
    const stateHash = hashJson(state);
    const revisionId = opaqueId("uirev");
    await tx`
      INSERT INTO ui_instance_revisions (
        id, ui_instance_id, revision_kind, revision, base_revision,
        validator_policy_version, state_schema_hash, scoped_state_json,
        scoped_state_hash, content_hash, validation_state, created_at, promoted_at
      ) VALUES (
        ${revisionId}, ${row.ui_instance_id}, 'state', ${nextStateRevision},
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
    await tx`
      UPDATE ui_surface_grants
      SET use_count = use_count + 1
      WHERE id = ${row.action_grant_id}
        AND use_count < max_uses
    `;
    const result = { stateRevision: nextStateRevision };
    await tx`
      UPDATE ui_interactions
      SET state = 'succeeded', result_redacted_json = ${JSON.stringify(result)}::jsonb,
          result_ref = ${revisionId}, consumed_at = ${now}
      WHERE id = ${row.interaction_id} AND state = 'token_issued'
    `;
    return {
      ok: true,
      value: {
        interactionId: row.interaction_id,
        state: "succeeded",
        result,
        resultRef: revisionId,
        renderRevision: row.render_revision,
        stateRevision: nextStateRevision,
      },
    };
  });
}
