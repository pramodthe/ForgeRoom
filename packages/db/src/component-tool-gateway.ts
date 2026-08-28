import { createHash, randomBytes } from "node:crypto";
import type postgres from "postgres";
import {
  buildGrantScopePreimage,
  canonicalizeJson,
  componentToolName,
  getRegistryDefinition,
  hashGrantScope,
} from "@forgeroom/domain";

export type SqlConnection = postgres.Sql;
export type SqlClient = postgres.Sql | postgres.TransactionSql;

export type ComponentOfferContext = {
  sessionId: string;
  generationId: string;
  generation: number;
  offeredComponentToolNames: string[];
  componentVersionId: string;
  stableName: string;
  descriptorHash: string;
  exposure: "agent_tool" | "server_only";
  grantScopeHash: string;
  hasActiveGrant: boolean;
};

export type ComponentGatewayResult<T> =
  { ok: true; value: T } | { ok: false; code: string; message: string };

function opaqueId(prefix: string): string {
  return `${prefix}_${randomBytes(10).toString("hex")}`;
}

function hashText(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function readEffectiveConfig(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

export type ComponentToolGenerationContext = {
  generationId: string;
  generation: number;
  channelAgentSessionId: string;
  sessionId: string;
  channelId: string;
  workspaceId: string;
  coworkerId: string;
  logicalThreadId: string;
  offeredComponentToolNames: string[];
};

export async function loadComponentToolGenerationContext(
  sql: SqlClient,
  generationId: string,
): Promise<ComponentToolGenerationContext | null> {
  const rows = await sql<
    {
      generation_id: string;
      generation: number;
      channel_agent_session_id: string;
      channel_id: string;
      workspace_id: string;
      coworker_id: string;
      logical_thread_id: string;
      effective_config: Record<string, unknown>;
    }[]
  >`
    SELECT
      g.id AS generation_id,
      g.generation,
      g.channel_agent_session_id,
      cas.channel_id,
      cas.workspace_id,
      cas.agent_profile_id AS coworker_id,
      cas.logical_agui_thread_id AS logical_thread_id,
      sr.effective_config_redacted_json AS effective_config
    FROM channel_agent_session_generations AS g
    JOIN channel_agent_sessions AS cas ON cas.id = g.channel_agent_session_id
    JOIN session_revisions AS sr ON sr.id = g.session_revision_id
    WHERE g.id = ${generationId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    generationId: row.generation_id,
    generation: row.generation,
    channelAgentSessionId: row.channel_agent_session_id,
    sessionId: row.channel_agent_session_id,
    channelId: row.channel_id,
    workspaceId: row.workspace_id,
    coworkerId: row.coworker_id,
    logicalThreadId: row.logical_thread_id,
    offeredComponentToolNames: parseStringArray(
      readEffectiveConfig(row.effective_config).component_tool_names,
    ),
  };
}

export async function loadPublishedComponentVersionForStableName(
  sql: SqlClient,
  input: { workspaceId: string; stableName: string },
): Promise<{
  componentVersionId: string;
  stableName: string;
  descriptorHash: string;
  exposure: "agent_tool" | "server_only";
  modelDescription: string;
} | null> {
  const rows = await sql<
    {
      id: string;
      stable_name: string;
      descriptor_hash: string;
      exposure: "agent_tool" | "server_only";
      model_description: string;
    }[]
  >`
    SELECT v.id, c.stable_name, v.descriptor_hash, v.exposure, v.model_description
    FROM ui_component_versions AS v
    JOIN ui_components AS c ON c.id = v.component_id
    WHERE c.workspace_id = ${input.workspaceId}
      AND c.stable_name = ${input.stableName}
      AND c.current_published_version_id = v.id
      AND v.revoked_at IS NULL
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    componentVersionId: row.id,
    stableName: row.stable_name,
    descriptorHash: row.descriptor_hash,
    exposure: row.exposure,
    modelDescription: row.model_description,
  };
}

export async function createBuildingComponentUiInstance(
  sql: SqlClient,
  input: {
    workspaceId: string;
    channelId: string;
    runId: string;
    runStepId: string;
    agentTurnId: string;
    logicalThreadId: string;
    toolCallId: string;
    componentVersionId: string;
    sourceEventId: string;
    creatorAgentId: string;
    title: string;
    textAlternative: string;
    now?: string;
  },
): Promise<{ uiInstanceId: string }> {
  const now = input.now ?? new Date().toISOString();
  const uiInstanceId = opaqueId("ui");
  const activityMessageId = opaqueId("act");
  await sql`
    INSERT INTO ui_instances (
      id, workspace_id, channel_id, run_id, run_step_id, agent_turn_id, logical_thread_id,
      tool_call_id, component_version_id, activity_message_id, source_event_id, creator_agent_id,
      title, text_alternative, status, created_at, updated_at
    )
    VALUES (
      ${uiInstanceId},
      ${input.workspaceId},
      ${input.channelId},
      ${input.runId},
      ${input.runStepId},
      ${input.agentTurnId},
      ${input.logicalThreadId},
      ${input.toolCallId},
      ${input.componentVersionId},
      ${activityMessageId},
      ${input.sourceEventId},
      ${input.creatorAgentId},
      ${input.title},
      ${input.textAlternative},
      'building',
      ${now},
      ${now}
    )
  `;
  return { uiInstanceId };
}

export async function loadComponentOfferContext(
  sql: SqlClient,
  input: {
    channelId: string;
    coworkerId: string;
    expectedSessionGeneration: number;
    componentVersionId: string;
    expectedDescriptorHash: string;
    expectedGrantScopeHash: string;
    runStepId?: string;
    agentTurnId?: string;
  },
): Promise<ComponentGatewayResult<ComponentOfferContext>> {
  const channelRows = await sql<{ workspace_id: string }[]>`
    SELECT workspace_id FROM channels WHERE id = ${input.channelId} LIMIT 1
  `;
  const workspaceId = channelRows[0]?.workspace_id;
  if (!workspaceId) {
    return { ok: false, code: "not_found", message: "Channel not found." };
  }

  const sessions = await sql<
    {
      session_id: string;
      generation_id: string;
      generation: number;
      effective_config: Record<string, unknown>;
    }[]
  >`
    SELECT
      cas.id AS session_id,
      csg.id AS generation_id,
      csg.generation,
      sr.effective_config_redacted_json AS effective_config
    FROM channel_agent_sessions AS cas
    JOIN channel_agent_session_generations AS csg ON csg.id = cas.current_generation_id
    JOIN session_revisions AS sr ON sr.id = csg.session_revision_id
    WHERE cas.channel_id = ${input.channelId}
      AND cas.agent_profile_id = ${input.coworkerId}
      AND cas.state = 'active'
    LIMIT 1
  `;
  const session = sessions[0];
  if (!session) {
    return { ok: false, code: "not_found", message: "Channel coworker session not found." };
  }
  if (session.generation !== input.expectedSessionGeneration) {
    return {
      ok: false,
      code: "stale_generation",
      message: "Session generation does not match the offered tool revision.",
    };
  }

  const versions = await sql<
    {
      id: string;
      stable_name: string;
      descriptor_hash: string;
      exposure: "agent_tool" | "server_only";
    }[]
  >`
    SELECT v.id, c.stable_name, v.descriptor_hash, v.exposure
    FROM ui_component_versions AS v
    JOIN ui_components AS c ON c.id = v.component_id
    WHERE v.id = ${input.componentVersionId}
      AND c.current_published_version_id = v.id
      AND v.revoked_at IS NULL
    LIMIT 1
  `;
  const version = versions[0];
  if (!version) {
    return { ok: false, code: "not_found", message: "Component version not found." };
  }
  if (version.descriptor_hash !== input.expectedDescriptorHash) {
    return {
      ok: false,
      code: "descriptor_mismatch",
      message: "Component descriptor hash does not match the published registry.",
    };
  }

  const grantScopeHash = hashGrantScope(
    buildGrantScopePreimage({
      workspaceId,
      channelId: input.channelId,
      agentProfileId: input.coworkerId,
      componentVersionId: input.componentVersionId,
    }),
  );
  if (grantScopeHash !== input.expectedGrantScopeHash) {
    return {
      ok: false,
      code: "grant_scope_mismatch",
      message: "Grant scope hash does not match the current intersection.",
    };
  }

  const grants = await sql<{ id: string }[]>`
    SELECT id
    FROM ui_component_grants
    WHERE component_version_id = ${input.componentVersionId}
      AND workspace_id = ${workspaceId}
      AND revoked_at IS NULL
      AND (
        channel_id IS NULL OR channel_id = ${input.channelId}
      )
      AND (
        agent_profile_id IS NULL OR agent_profile_id = ${input.coworkerId}
      )
    LIMIT 1
  `;

  if (input.runStepId && input.agentTurnId) {
    const turnRows = await sql<{ id: string }[]>`
      SELECT t.id
      FROM agent_turns AS t
      WHERE t.id = ${input.agentTurnId}
        AND t.run_step_id = ${input.runStepId}
        AND t.channel_agent_session_id = ${session.session_id}
        AND t.session_generation_id = ${session.generation_id}
        AND t.state IN ('acquiring', 'creating', 'streaming', 'resuming')
      LIMIT 1
    `;
    if (!turnRows[0]) {
      return {
        ok: false,
        code: "not_found",
        message: "Agent turn is not bound to the active session generation.",
      };
    }
  }

  const offeredComponentToolNames = parseStringArray(
    readEffectiveConfig(session.effective_config).component_tool_names,
  );

  return {
    ok: true,
    value: {
      sessionId: session.session_id,
      generationId: session.generation_id,
      generation: session.generation,
      offeredComponentToolNames,
      componentVersionId: version.id,
      stableName: version.stable_name,
      descriptorHash: version.descriptor_hash,
      exposure: version.exposure,
      grantScopeHash,
      hasActiveGrant: grants.length > 0,
    },
  };
}

export async function finalizeOrQuarantineUiInstance(
  sql: SqlConnection,
  input: {
    uiInstanceId: string;
    expectedStatus: "building" | "degraded";
    expectedRenderRevision: number | null;
    nextRenderRevision: number;
    renderManifestHash: string;
    validatedProps?: Record<string, unknown>;
    outcome: "ready" | "quarantined";
    now?: string;
  },
): Promise<
  ComponentGatewayResult<{ uiInstanceId: string; renderRevision: number; status: string }>
> {
  return sql.begin(async (tx) => finalizeOrQuarantineUiInstanceInTx(tx, input));
}

async function finalizeOrQuarantineUiInstanceInTx(
  tx: SqlClient,
  input: {
    uiInstanceId: string;
    expectedStatus: "building" | "degraded";
    expectedRenderRevision: number | null;
    nextRenderRevision: number;
    renderManifestHash: string;
    validatedProps?: Record<string, unknown>;
    outcome: "ready" | "quarantined";
    now?: string;
  },
): Promise<
  ComponentGatewayResult<{ uiInstanceId: string; renderRevision: number; status: string }>
> {
  const now = input.now ?? new Date().toISOString();

  const rows = await tx<
    {
      id: string;
      status: string;
      current_render_revision: number | null;
      component_version_id: string;
      render_grant_id: string | null;
      text_alternative: string;
      validated_props_json: Record<string, unknown> | null;
    }[]
  >`
      SELECT id, status, current_render_revision, component_version_id, render_grant_id, text_alternative
      FROM ui_instances
      WHERE id = ${input.uiInstanceId}
      FOR UPDATE
    `;
  const instance = rows[0];
  if (!instance) {
    return { ok: false, code: "not_found", message: "UIInstance not found." };
  }
  if (instance.status !== input.expectedStatus) {
    return {
      ok: false,
      code: "status_mismatch",
      message: "UIInstance status does not match the finalize precondition.",
    };
  }
  if (instance.current_render_revision !== input.expectedRenderRevision) {
    return {
      ok: false,
      code: "revision_mismatch",
      message: "UIInstance render revision does not match the finalize precondition.",
    };
  }

  const revisionId = opaqueId("uirev");
  const renderNodeSet = [{ nodeId: "root" }];
  const renderNodeSetHash = hashText(canonicalizeJson(renderNodeSet));
  const validatedProps = input.validatedProps ?? { schemaVersion: 1 };
  const validatedPropsHash = hashText(canonicalizeJson(validatedProps));
  const renderPayload = {
    schemaVersion: 1,
    surfaceId: instance.id,
    props: validatedProps,
  };
  const renderPayloadHash = hashText(canonicalizeJson(renderPayload));
  const renderManifest = {
    schemaVersion: 1,
    renderRevision: input.nextRenderRevision,
    manifestHash: input.renderManifestHash,
  };
  const contentHash = hashText(
    canonicalizeJson({
      manifest: input.renderManifestHash,
      props: validatedPropsHash,
      payload: renderPayloadHash,
    }),
  );

  await tx`
      INSERT INTO ui_instance_revisions (
        id, ui_instance_id, revision_kind, revision, base_revision, component_version_id,
        renderer_profile_hash, validator_policy_version, render_node_set_json, render_node_set_hash,
        render_payload_json, render_payload_hash, render_manifest_json, manifest_hash,
        validated_props_json, validated_props_hash, accessible_summary, content_hash,
        validation_state, created_at, promoted_at
      ) VALUES (
        ${revisionId}, ${instance.id}, 'render', ${input.nextRenderRevision},
        ${input.expectedRenderRevision}, ${instance.component_version_id}, ${input.renderManifestHash},
        'registry_v1', ${JSON.stringify(renderNodeSet)}::jsonb, ${renderNodeSetHash},
        ${JSON.stringify(renderPayload)}::jsonb, ${renderPayloadHash},
        ${JSON.stringify(renderManifest)}::jsonb, ${input.renderManifestHash},
        ${JSON.stringify(validatedProps)}::jsonb, ${validatedPropsHash},
        ${instance.text_alternative}, ${contentHash}, 'valid', ${now}, ${now}
      )
    `;

  const nextStatus = input.outcome === "ready" ? "ready" : "failed";
  const updated = await tx<{ id: string }[]>`
      UPDATE ui_instances
      SET status = ${nextStatus},
          current_render_revision = ${input.nextRenderRevision},
          last_good_render_revision = ${input.outcome === "ready" ? input.nextRenderRevision : instance.current_render_revision},
          ready_at = ${input.outcome === "ready" ? now : null},
          quarantined_at = ${input.outcome === "quarantined" ? now : null},
          updated_at = ${now}
      WHERE id = ${instance.id}
        AND status = ${input.expectedStatus}
        AND current_render_revision IS NOT DISTINCT FROM ${input.expectedRenderRevision}
      RETURNING id
    `;
  if (!updated[0]) {
    return {
      ok: false,
      code: "conflict",
      message: "UIInstance finalize lost a concurrent update race.",
    };
  }

  return {
    ok: true,
    value: {
      uiInstanceId: instance.id,
      renderRevision: input.nextRenderRevision,
      status: nextStatus,
    },
  };
}

export async function applyScopedUiInteractionWorker(
  sql: SqlConnection,
  input: {
    interactionId: string;
    uiInstanceId: string;
    expectedInteractionState: "token_issued" | "confirmed";
    expectedRenderRevision: number;
    expectedStateRevision: number | null;
    actionGrantId: string;
    expectedActionGrantUseCount: number;
    redactedInputHash: string;
    now?: string;
  },
): Promise<
  ComponentGatewayResult<{
    interactionId: string;
    enqueuedContinuation: boolean;
    queueItemId: string | null;
  }>
> {
  const now = input.now ?? new Date().toISOString();

  return sql.begin(async (tx) => {
    const rows = await tx<
      {
        interaction_id: string;
        state: string;
        payload_hash: string;
        render_revision: number;
        expected_state_revision: number | null;
        action_grant_id: string;
        action_use_count: number;
        run_step_id: string;
        session_generation_id: string;
        channel_agent_session_id: string;
        interrupt_id: string | null;
        interrupt_state: string | null;
      }[]
    >`
      SELECT
        i.id AS interaction_id,
        i.state,
        i.payload_hash,
        i.render_revision,
        i.expected_state_revision,
        i.action_grant_id,
        g.use_count AS action_use_count,
        ui.run_step_id,
        at.session_generation_id,
        at.channel_agent_session_id,
        intr.id AS interrupt_id,
        intr.state AS interrupt_state
      FROM ui_interactions AS i
      JOIN ui_instances AS ui ON ui.id = i.ui_instance_id
      JOIN ui_surface_grants AS g ON g.id = i.action_grant_id
      JOIN agent_turns AS at ON at.id = ui.agent_turn_id
      LEFT JOIN ui_component_interrupts AS intr ON intr.tool_call_id = ui.tool_call_id
      WHERE i.id = ${input.interactionId}
        AND i.ui_instance_id = ${input.uiInstanceId}
        AND g.grant_kind = 'action'
        AND g.revoked_at IS NULL
        AND g.expires_at > ${now}
        AND (g.max_uses IS NULL OR g.use_count < g.max_uses)
      FOR UPDATE OF i, g, ui, intr
    `;
    const row = rows[0];
    if (!row) {
      return { ok: false, code: "not_found", message: "Interaction not found." };
    }
    if (row.state !== "succeeded") {
      return {
        ok: false,
        code: "interaction_state_mismatch",
        message: "Interaction must be committed before continuation enqueue.",
      };
    }
    if (row.payload_hash !== input.redactedInputHash) {
      return {
        ok: false,
        code: "input_hash_mismatch",
        message: "Redacted input hash does not match the durable interaction record.",
      };
    }
    if (
      row.render_revision !== input.expectedRenderRevision ||
      row.expected_state_revision !== input.expectedStateRevision ||
      row.action_grant_id !== input.actionGrantId ||
      row.action_use_count !== input.expectedActionGrantUseCount
    ) {
      return {
        ok: false,
        code: "scope_mismatch",
        message: "Interaction scope no longer matches the worker command.",
      };
    }

    if (!row.interrupt_id || row.interrupt_state !== "waiting") {
      return {
        ok: true,
        value: {
          interactionId: row.interaction_id,
          enqueuedContinuation: false,
          queueItemId: null,
        },
      };
    }

    const queueItemId = opaqueId("q");
    await tx`
      SELECT id FROM channel_agent_sessions WHERE id = ${row.channel_agent_session_id} FOR UPDATE
    `;
    await tx`
      INSERT INTO turn_queue_items (
        id, channel_agent_session_id, run_step_id, bound_session_generation_id,
        input_type, input_payload_redacted_json, fifo_sequence, state, created_at
      )
      SELECT
        ${queueItemId},
        ${row.channel_agent_session_id},
        ${row.run_step_id},
        ${row.session_generation_id},
        'component_interaction_response',
        ${JSON.stringify({
          interaction_id: row.interaction_id,
          ui_instance_id: input.uiInstanceId,
          component_interrupt_id: row.interrupt_id,
        })}::jsonb,
        COALESCE((SELECT MAX(fifo_sequence) + 1 FROM turn_queue_items WHERE channel_agent_session_id = ${row.channel_agent_session_id}), 0),
        'queued',
        ${now}
    `;

    await tx`
      UPDATE ui_component_interrupts
      SET state = 'resolved',
          continuation_queue_item_id = ${queueItemId},
          resolved_at = ${now}
      WHERE id = ${row.interrupt_id}
        AND state = 'waiting'
    `;

    const consumed = await tx<{ id: string }[]>`
      UPDATE ui_surface_grants
      SET use_count = use_count + 1
      WHERE id = ${row.action_grant_id}
        AND revoked_at IS NULL
        AND expires_at > ${now}
        AND (max_uses IS NULL OR use_count < max_uses)
      RETURNING id
    `;
    if (!consumed[0]) {
      return {
        ok: false,
        code: "scope_mismatch",
        message: "Action grant could not be consumed for continuation enqueue.",
      };
    }

    return {
      ok: true,
      value: {
        interactionId: row.interaction_id,
        enqueuedContinuation: true,
        queueItemId,
      },
    };
  });
}

export type ComponentToolMcpBrokerResult = {
  status: "ready" | "awaiting_component_input" | "quarantined";
  instanceId: string;
  renderRevision: number | null;
  textAlternative: string;
  componentName: string;
};

function readTextAlternative(stableName: string, props: Record<string, unknown>): string {
  for (const key of ["caption", "title", "heading", "description"]) {
    const value = props[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return getRegistryDefinition(stableName)?.modelDescription ?? stableName;
}

function validateRegistryProps(
  stableName: string,
  props: Record<string, unknown>,
): { ok: true } | { ok: false; message: string } {
  const definition = getRegistryDefinition(stableName);
  if (!definition) {
    return { ok: false, message: "Unknown controlled component." };
  }
  const schema = definition.parameterSchema;
  const required = Array.isArray(schema.required)
    ? schema.required.filter((value): value is string => typeof value === "string")
    : [];
  for (const key of required) {
    if (!(key in props)) {
      return { ok: false, message: `Missing required prop: ${key}` };
    }
  }
  return { ok: true };
}

function isInteractiveComponent(stableName: string): boolean {
  const definition = getRegistryDefinition(stableName);
  if (!definition) {
    return false;
  }
  return definition.declaredInteractionIntents.length > 0 || definition.confirmation !== "none";
}

async function setupInteractiveBrokerArtifacts(
  sql: SqlClient,
  input: {
    uiInstanceId: string;
    generationId: string;
    toolCallId: string;
    stableName: string;
    renderRevision: number;
    renderManifestHash: string;
    grantScopeHash: string;
    runId: string;
    runStepId: string;
    agentTurnId: string;
    logicalThreadId: string;
    now: string;
  },
): Promise<void> {
  const definition = getRegistryDefinition(input.stableName);
  const primaryIntent = definition?.declaredInteractionIntents[0] ?? "interact";
  const inputSchema = definition?.parameterSchema ?? {};
  const inputSchemaHash = hashText(canonicalizeJson(inputSchema));
  const renderGrantId = opaqueId("rg");
  await sql`
    INSERT INTO ui_surface_grants (
      id, ui_instance_id, grant_kind, policy_revision, rail, allowed_component_types_json,
      limits_json, grant_scope_hash, issued_by, expires_at, created_at
    )
    VALUES (
      ${renderGrantId}, ${input.uiInstanceId}, 'render', 1, 'registry_v1', '["table"]'::jsonb,
      '{}'::jsonb, ${input.grantScopeHash}, 'application_policy', ${input.now}, ${input.now}
    )
  `;
  await sql`UPDATE ui_instances SET render_grant_id = ${renderGrantId} WHERE id = ${input.uiInstanceId}`;

  const actionGrantId = opaqueId("ag");
  await sql`
    INSERT INTO ui_surface_grants (
      id, ui_instance_id, grant_kind, policy_revision, bound_render_revision, bound_manifest_hash,
      action_ref, handler_key, action_mode, input_schema_json, input_schema_hash,
      allowed_render_node_ids_json, grant_scope_hash, max_uses, use_count, issued_by, expires_at, created_at
    )
    VALUES (
      ${actionGrantId}, ${input.uiInstanceId}, 'action', 1, ${input.renderRevision}, ${input.renderManifestHash},
      ${primaryIntent}, ${primaryIntent}, 'local_state', ${JSON.stringify(inputSchema)}::jsonb, ${inputSchemaHash},
      '["root"]'::jsonb, ${input.grantScopeHash}, 3, 0, 'application_policy', ${input.now}, ${input.now}
    )
  `;

  const interruptId = opaqueId("intr");
  await sql`
    INSERT INTO ui_component_interrupts (
      id, ui_instance_id, run_id, run_step_id, agent_turn_id, logical_thread_id,
      tool_call_id, session_generation_id, action_grant_id, input_schema_hash, state, created_at
    )
    VALUES (
      ${interruptId}, ${input.uiInstanceId}, ${input.runId}, ${input.runStepId}, ${input.agentTurnId},
      ${input.logicalThreadId}, ${input.toolCallId}, ${input.generationId}, ${actionGrantId},
      ${inputSchemaHash}, 'waiting', ${input.now}
    )
  `;
}

export async function brokerComponentToolMcpCall(
  sql: SqlConnection,
  input: {
    generationId: string;
    stableName: string;
    toolCallId: string;
    props: Record<string, unknown>;
    now?: string;
  },
): Promise<ComponentToolMcpBrokerResult> {
  const now = input.now ?? new Date().toISOString();
  const componentName = componentToolName(input.stableName);
  const existingRows = await sql<
    {
      id: string;
      status: string;
      current_render_revision: number | null;
      text_alternative: string;
    }[]
  >`
    SELECT id, status, current_render_revision, text_alternative
    FROM ui_instances
    WHERE tool_call_id = ${input.toolCallId}
    LIMIT 1
  `;
  const existing = existingRows[0];
  if (existing) {
    if (existing.status === "ready") {
      if (isInteractiveComponent(input.stableName)) {
        return {
          status: "awaiting_component_input",
          instanceId: existing.id,
          renderRevision: existing.current_render_revision,
          textAlternative: existing.text_alternative,
          componentName,
        };
      }
      return {
        status: "ready",
        instanceId: existing.id,
        renderRevision: existing.current_render_revision,
        textAlternative: existing.text_alternative,
        componentName,
      };
    }
    if (existing.status === "building") {
      return {
        status: "awaiting_component_input",
        instanceId: existing.id,
        renderRevision: existing.current_render_revision,
        textAlternative: existing.text_alternative,
        componentName,
      };
    }
  }

  const context = await loadComponentToolGenerationContext(sql, input.generationId);
  if (!context) {
    return {
      status: "quarantined",
      instanceId: "",
      renderRevision: null,
      textAlternative: componentName,
      componentName,
    };
  }
  if (!context.offeredComponentToolNames.includes(componentName)) {
    return {
      status: "quarantined",
      instanceId: "",
      renderRevision: null,
      textAlternative: componentName,
      componentName,
    };
  }

  const version = await loadPublishedComponentVersionForStableName(sql, {
    workspaceId: context.workspaceId,
    stableName: input.stableName,
  });
  if (!version || version.exposure === "server_only") {
    return {
      status: "quarantined",
      instanceId: "",
      renderRevision: null,
      textAlternative: componentName,
      componentName,
    };
  }

  const grantScopeHash = hashGrantScope(
    buildGrantScopePreimage({
      workspaceId: context.workspaceId,
      channelId: context.channelId,
      agentProfileId: context.coworkerId,
      componentVersionId: version.componentVersionId,
    }),
  );
  const offer = await loadComponentOfferContext(sql, {
    channelId: context.channelId,
    coworkerId: context.coworkerId,
    expectedSessionGeneration: context.generation,
    componentVersionId: version.componentVersionId,
    expectedDescriptorHash: version.descriptorHash,
    expectedGrantScopeHash: grantScopeHash,
  });
  if (!offer.ok || !offer.value.hasActiveGrant) {
    return {
      status: "quarantined",
      instanceId: "",
      renderRevision: null,
      textAlternative: componentName,
      componentName,
    };
  }

  const validation = validateRegistryProps(input.stableName, input.props);
  if (!validation.ok) {
    return {
      status: "quarantined",
      instanceId: "",
      renderRevision: null,
      textAlternative: validation.message,
      componentName,
    };
  }

  const activeTurnRows = await sql<
    {
      agent_turn_id: string;
      run_step_id: string;
      run_id: string;
      source_event_id: string;
    }[]
  >`
    SELECT
      t.id AS agent_turn_id,
      t.run_step_id,
      rs.run_id,
      m.event_id AS source_event_id
    FROM agent_turns AS t
    JOIN run_steps AS rs ON rs.id = t.run_step_id
    JOIN runs AS r ON r.id = rs.run_id
    JOIN messages AS m ON m.id = r.source_message_id
    WHERE t.channel_agent_session_id = ${context.channelAgentSessionId}
      AND t.session_generation_id = ${input.generationId}
      AND t.state IN ('acquiring', 'creating', 'streaming', 'resuming')
    ORDER BY t.started_at DESC NULLS LAST
    LIMIT 1
  `;
  const activeTurn = activeTurnRows[0];
  if (!activeTurn) {
    return {
      status: "quarantined",
      instanceId: "",
      renderRevision: null,
      textAlternative: "No active turn is bound to this session generation.",
      componentName,
    };
  }

  const textAlternative = readTextAlternative(input.stableName, input.props);
  const renderManifestHash = hashText(canonicalizeJson(input.props));
  const interactive = isInteractiveComponent(input.stableName);

  return sql.begin(async (tx) => {
    const created = await createBuildingComponentUiInstance(tx, {
      workspaceId: context.workspaceId,
      channelId: context.channelId,
      runId: activeTurn.run_id,
      runStepId: activeTurn.run_step_id,
      agentTurnId: activeTurn.agent_turn_id,
      logicalThreadId: context.logicalThreadId,
      toolCallId: input.toolCallId,
      componentVersionId: version.componentVersionId,
      sourceEventId: activeTurn.source_event_id,
      creatorAgentId: context.coworkerId,
      title: textAlternative,
      textAlternative,
      now,
    });

    const finalized = await finalizeOrQuarantineUiInstanceInTx(tx, {
      uiInstanceId: created.uiInstanceId,
      expectedStatus: "building",
      expectedRenderRevision: null,
      nextRenderRevision: 1,
      renderManifestHash,
      validatedProps: input.props,
      outcome: "ready",
      now,
    });
    if (!finalized.ok) {
      return {
        status: "quarantined" as const,
        instanceId: created.uiInstanceId,
        renderRevision: null,
        textAlternative,
        componentName,
      };
    }

    if (interactive) {
      await setupInteractiveBrokerArtifacts(tx, {
        uiInstanceId: created.uiInstanceId,
        generationId: input.generationId,
        toolCallId: input.toolCallId,
        stableName: input.stableName,
        renderRevision: finalized.value.renderRevision,
        renderManifestHash,
        grantScopeHash,
        runId: activeTurn.run_id,
        runStepId: activeTurn.run_step_id,
        agentTurnId: activeTurn.agent_turn_id,
        logicalThreadId: context.logicalThreadId,
        now,
      });
      return {
        status: "awaiting_component_input" as const,
        instanceId: created.uiInstanceId,
        renderRevision: finalized.value.renderRevision,
        textAlternative,
        componentName,
      };
    }

    return {
      status: "ready" as const,
      instanceId: created.uiInstanceId,
      renderRevision: finalized.value.renderRevision,
      textAlternative,
      componentName,
    };
  });
}
