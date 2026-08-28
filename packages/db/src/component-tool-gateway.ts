import { createHash, randomBytes } from "node:crypto";
import type postgres from "postgres";
import { buildGrantScopePreimage, canonicalizeJson, hashGrantScope } from "@forgeroom/domain";

export type SqlClient = postgres.Sql;

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
  | { ok: true; value: T }
  | { ok: false; code: string; message: string };

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

export async function loadComponentOfferContext(
  sql: SqlClient,
  input: {
    channelId: string;
    coworkerId: string;
    expectedSessionGeneration: number;
    componentVersionId: string;
    expectedDescriptorHash: string;
    expectedGrantScopeHash: string;
  },
): Promise<ComponentGatewayResult<ComponentOfferContext>> {
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
      workspaceId: (
        await sql<{ workspace_id: string }[]>`
          SELECT workspace_id FROM channels WHERE id = ${input.channelId} LIMIT 1
        `
      )[0]?.workspace_id ?? "",
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
      AND revoked_at IS NULL
      AND (
        channel_id IS NULL OR channel_id = ${input.channelId}
      )
      AND (
        agent_profile_id IS NULL OR agent_profile_id = ${input.coworkerId}
      )
    LIMIT 1
  `;

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
  sql: SqlClient,
  input: {
    uiInstanceId: string;
    expectedStatus: "building" | "degraded";
    expectedRenderRevision: number | null;
    nextRenderRevision: number;
    renderManifestHash: string;
    outcome: "ready" | "quarantined";
    now?: string;
  },
): Promise<ComponentGatewayResult<{ uiInstanceId: string; renderRevision: number; status: string }>> {
  const now = input.now ?? new Date().toISOString();

  return sql.begin(async (tx) => {
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
    const validatedProps = { schemaVersion: 1 };
    const validatedPropsHash = hashText(canonicalizeJson(validatedProps));
    const renderPayload = { schemaVersion: 1, surfaceId: instance.id };
    const renderPayloadHash = hashText(canonicalizeJson(renderPayload));
    const renderManifest = { schemaVersion: 1, renderRevision: input.nextRenderRevision };
    const contentHash = hashText(
      canonicalizeJson({
        manifest: input.renderManifestHash,
        props: validatedPropsHash,
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
  });
}

export async function applyScopedUiInteractionWorker(
  sql: SqlClient,
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
      FOR UPDATE OF i, g, ui, intr
    `;
    const row = rows[0];
    if (!row) {
      return { ok: false, code: "not_found", message: "Interaction not found." };
    }
    if (
      row.state !== "succeeded" &&
      row.state !== input.expectedInteractionState
    ) {
      return {
        ok: false,
        code: "interaction_state_mismatch",
        message: "Interaction is not in the expected worker state.",
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
