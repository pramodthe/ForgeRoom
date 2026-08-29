import type {
  ActionGrant,
  DataGrant,
  DataGrantDisclosure,
  UiInstanceReplayResponse,
} from "@forgeroom/contracts";
import {
  actionGrantSchema,
  dataGrantSchema,
  uiInstanceReplayResponseSchema,
} from "@forgeroom/contracts";
import type postgres from "postgres";
import type { createSql } from "./client";

type SqlClient = ReturnType<typeof createSql>;
type SqlExecutor = SqlClient | postgres.TransactionSql;

export type SurfaceGrantRow = {
  id: string;
  grant_kind: "render" | "data" | "action";
  policy_revision: number;
  bound_render_revision: number | null;
  bound_manifest_hash: string | null;
  rail: string | null;
  allowed_component_types_json: unknown;
  limits_json: unknown;
  data_ref: string | null;
  allowed_field_paths_json: unknown;
  max_rows: number | null;
  max_bytes: number | null;
  snapshot_schema_hash: string | null;
  immutable_snapshot_hash: string | null;
  action_ref: string | null;
  action_mode: string | null;
  input_schema_hash: string | null;
  allowed_render_node_ids_json: unknown;
  linked_data_grant_id: string | null;
  component_interrupt_id: string | null;
  grant_body_redacted_json: unknown;
  grant_scope_hash: string;
  max_uses: number | null;
  use_count: number;
  expires_at: string | Date;
  revoked_at: string | Date | null;
};

export type UiInstanceReplayBundle = {
  instanceId: string;
  workspaceId: string;
  channelId: string;
  runId: string;
  runStepId: string;
  agentTurnId: string;
  logicalThreadId: string;
  componentVersionId: string;
  componentName: string;
  componentSemanticVersion: string;
  componentDescriptorHash: string;
  rendererKey: string;
  rendererProfileHash: string;
  rail: "registry_v1";
  status: "building" | "ready" | "degraded" | "failed" | "revoked" | "closed";
  currentRenderRevision: number | null;
  lastGoodRenderRevision: number | null;
  currentStateRevision: number | null;
  renderManifestHash: string | null;
  validatedPropsHash: string | null;
  scopedStateHash: string | null;
  validatedProps: Record<string, unknown> | null;
  scopedState: Record<string, unknown> | null;
  baseRenderRevision: number | null;
  baseStateRevision: number | null;
  textAlternative: string;
  createdAt: string;
  updatedAt: string;
  renderGrant: SurfaceGrantRow | null;
  dataGrants: SurfaceGrantRow[];
  actionGrants: SurfaceGrantRow[];
  lastChannelSequence: number;
};

function toIso(value: string | Date): string {
  return typeof value === "string" ? new Date(value).toISOString() : value.toISOString();
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function mapRenderGrant(grant: SurfaceGrantRow) {
  return {
    id: grant.id,
    rail: "registry_v1" as const,
    registryVersion: "registry-1" as const,
    allowedComponentTypes: parseStringArray(grant.allowed_component_types_json) as Array<
      "table" | "chart" | "form"
    >,
    policyRevision: grant.policy_revision,
    grantScopeHash: grant.grant_scope_hash,
    expiresAt: toIso(grant.expires_at),
    revoked: grant.revoked_at !== null,
  };
}

function grantIsActive(grant: SurfaceGrantRow, now: Date): boolean {
  return (
    grant.revoked_at === null &&
    new Date(grant.expires_at).getTime() > now.getTime() &&
    (grant.max_uses === null || grant.use_count < grant.max_uses)
  );
}

function mapDataGrant(grant: SurfaceGrantRow): DataGrantDisclosure | null {
  // The redacted grant body is the canonical location for provenance and
  // classification in the P0 schema. Never invent source identity when an old
  // or malformed row cannot be validated.
  const parsed = dataGrantSchema.safeParse(grant.grant_body_redacted_json);
  if (!parsed.success) {
    return null;
  }
  const dataGrant: DataGrant = parsed.data;
  if (
    dataGrant.id !== grant.id ||
    dataGrant.bound_render_revision !== grant.bound_render_revision ||
    dataGrant.bound_manifest_hash !== grant.bound_manifest_hash ||
    dataGrant.data_ref !== grant.data_ref ||
    dataGrant.snapshot_schema_hash !== grant.snapshot_schema_hash ||
    dataGrant.immutable_snapshot_hash !== grant.immutable_snapshot_hash
  ) {
    return null;
  }
  const sourceHash = dataGrant.immutable_snapshot_hash;
  const source: DataGrantDisclosure["source"] =
    dataGrant.source.kind === "artifact_revision"
      ? {
          kind: "artifactRevision",
          artifactId: dataGrant.source.artifact_id,
          revision: dataGrant.source.revision,
          contentHash: sourceHash,
        }
      : dataGrant.source.kind === "query_snapshot"
        ? {
            kind: "querySnapshot",
            snapshotId: dataGrant.source.snapshot_id,
            snapshotHash: sourceHash,
          }
        : {
            kind: "runEvent",
            eventId: dataGrant.source.run_event_id,
            eventHash: sourceHash,
          };

  return {
    id: grant.id,
    boundRenderRevision: dataGrant.bound_render_revision,
    boundManifestHash: dataGrant.bound_manifest_hash,
    dataRef: dataGrant.data_ref,
    source,
    classification: dataGrant.classification,
    snapshotSchemaHash: dataGrant.snapshot_schema_hash,
    allowedFieldPaths: dataGrant.allowed_field_paths,
    maxRows: dataGrant.max_rows,
    maxBytes: dataGrant.max_bytes,
    maxTimeMs: dataGrant.max_time_ms,
    immutableSnapshotHash: dataGrant.immutable_snapshot_hash,
    expiresAt: toIso(grant.expires_at),
    revoked: grant.revoked_at !== null,
  };
}

function mapActionGrant(
  grant: SurfaceGrantRow,
  dataGrantsById: ReadonlyMap<string, DataGrantDisclosure>,
) {
  const parsed = actionGrantSchema.safeParse(grant.grant_body_redacted_json);
  if (!parsed.success) {
    return null;
  }
  const actionGrant: ActionGrant = parsed.data;
  if (
    actionGrant.id !== grant.id ||
    actionGrant.bound_render_revision !== grant.bound_render_revision ||
    actionGrant.bound_manifest_hash !== grant.bound_manifest_hash ||
    actionGrant.action_ref !== grant.action_ref ||
    actionGrant.input_schema_hash !== grant.input_schema_hash ||
    actionGrant.mode !== grant.action_mode ||
    JSON.stringify(actionGrant.allowed_render_node_ids) !==
      JSON.stringify(parseStringArray(grant.allowed_render_node_ids_json))
  ) {
    return null;
  }
  const common = {
    id: actionGrant.id,
    mode: actionGrant.mode,
    boundRenderRevision: actionGrant.bound_render_revision,
    boundManifestHash: actionGrant.bound_manifest_hash,
    actionRef: actionGrant.action_ref,
    inputSchemaHash: actionGrant.input_schema_hash,
    allowedRenderNodeIds: actionGrant.allowed_render_node_ids,
    requiresRecentAuth: actionGrant.requires_recent_auth,
    maxUses: actionGrant.max_uses,
    useCount: grant.use_count,
    expiresAt: toIso(grant.expires_at),
    revoked: grant.revoked_at !== null,
  };
  if (actionGrant.mode === "server_read") {
    if (!grant.linked_data_grant_id || actionGrant.data_grant_id !== grant.linked_data_grant_id) {
      return null;
    }
    const dataGrant = dataGrantsById.get(grant.linked_data_grant_id);
    if (!dataGrant) {
      return null;
    }
    if (actionGrant.data_ref !== dataGrant.dataRef) {
      return null;
    }
    return {
      ...common,
      mode: actionGrant.mode,
      dataGrantId: dataGrant.id,
      dataRef: dataGrant.dataRef,
    };
  }
  if (actionGrant.mode === "complete_component_interrupt") {
    if (
      !grant.component_interrupt_id ||
      actionGrant.component_interrupt_id !== grant.component_interrupt_id
    ) {
      return null;
    }
    return {
      ...common,
      mode: actionGrant.mode,
      componentInterruptId: grant.component_interrupt_id,
    };
  }
  return { ...common, mode: actionGrant.mode };
}

async function loadUiInstanceReplayBundleFrom(
  sql: SqlExecutor,
  instanceId: string,
): Promise<UiInstanceReplayBundle | null> {
  const rows = await sql<
    {
      id: string;
      workspace_id: string;
      channel_id: string;
      run_id: string;
      run_step_id: string;
      agent_turn_id: string;
      logical_thread_id: string;
      component_version_id: string;
      stable_name: string;
      semantic_version: string;
      descriptor_hash: string;
      renderer_key: string;
      status: UiInstanceReplayBundle["status"];
      current_render_revision: number | null;
      last_good_render_revision: number | null;
      current_state_revision: number | null;
      text_alternative: string;
      created_at: string | Date;
      updated_at: string | Date;
      render_grant_id: string | null;
    }[]
  >`
    SELECT
      ui.id,
      ui.workspace_id,
      ui.channel_id,
      ui.run_id,
      ui.run_step_id,
      ui.agent_turn_id,
      ui.logical_thread_id,
      ui.component_version_id,
      c.stable_name,
      v.semantic_version,
      v.descriptor_hash,
      v.renderer_key,
      ui.status,
      ui.current_render_revision,
      ui.last_good_render_revision,
      ui.current_state_revision,
      ui.text_alternative,
      ui.created_at,
      ui.updated_at,
      ui.render_grant_id
    FROM ui_instances AS ui
    JOIN ui_component_versions AS v ON v.id = ui.component_version_id
    JOIN ui_components AS c ON c.id = v.component_id
    WHERE ui.id = ${instanceId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) {
    return null;
  }

  const grants = await sql<SurfaceGrantRow[]>`
    SELECT
      id, grant_kind, policy_revision, bound_render_revision, bound_manifest_hash,
      rail, allowed_component_types_json, limits_json, data_ref, allowed_field_paths_json,
      max_rows, max_bytes, snapshot_schema_hash, immutable_snapshot_hash,
      action_ref, action_mode, input_schema_hash, allowed_render_node_ids_json,
      linked_data_grant_id, component_interrupt_id, grant_body_redacted_json,
      grant_scope_hash, max_uses, use_count, expires_at, revoked_at
    FROM ui_surface_grants
    WHERE ui_instance_id = ${instanceId}
    ORDER BY created_at ASC
  `;

  const requestedRenderRevision = row.current_render_revision;
  let renderManifestHash: string | null = null;
  let validatedPropsHash: string | null = null;
  let validatedProps: Record<string, unknown> | null = null;
  let scopedStateHash: string | null = null;
  let scopedState: Record<string, unknown> | null = null;
  let baseRenderRevision: number | null = null;
  let baseStateRevision: number | null = null;
  let rendererProfileHash = row.descriptor_hash;
  let replayRenderRevision: number | null = null;
  let replayLastGoodRenderRevision: number | null = null;
  let replayStateRevision: number | null = null;

  if (
    requestedRenderRevision !== null ||
    row.last_good_render_revision !== null ||
    row.current_state_revision !== null
  ) {
    const revisions = await sql<
      {
        revision_kind: "render" | "state";
        revision: number;
        base_revision: number | null;
        manifest_hash: string | null;
        validated_props_json: Record<string, unknown> | null;
        validated_props_hash: string | null;
        scoped_state_json: Record<string, unknown> | null;
        scoped_state_hash: string | null;
        renderer_profile_hash: string | null;
        validation_state: "valid" | "invalid" | "quarantined";
        promoted_at: string | Date | null;
      }[]
    >`
      SELECT
        revision_kind, revision, base_revision, manifest_hash,
        validated_props_json, validated_props_hash,
        scoped_state_json, scoped_state_hash, renderer_profile_hash
      FROM ui_instance_revisions
      WHERE ui_instance_id = ${instanceId}
        AND validation_state = 'valid'
        AND promoted_at IS NOT NULL
        AND (
          (
            revision_kind = 'render'
            AND (
              revision = ${requestedRenderRevision ?? -1}
              OR revision = ${row.last_good_render_revision ?? -1}
            )
          )
          OR (revision_kind = 'state' AND revision = ${row.current_state_revision ?? -1})
        )
      ORDER BY revision DESC
    `;
    for (const revision of revisions) {
      if (revision.revision_kind === "render") {
        if (revision.revision === row.last_good_render_revision) {
          replayLastGoodRenderRevision = revision.revision;
        }
        if (
          replayRenderRevision === null &&
          (revision.revision === requestedRenderRevision ||
            revision.revision === row.last_good_render_revision)
        ) {
          replayRenderRevision = revision.revision;
        } else {
          continue;
        }
        renderManifestHash = revision.manifest_hash;
        validatedPropsHash = revision.validated_props_hash;
        validatedProps = revision.validated_props_json;
        baseRenderRevision = revision.base_revision;
        rendererProfileHash = revision.renderer_profile_hash ?? rendererProfileHash;
      } else if (revision.revision_kind === "state") {
        replayStateRevision = revision.revision;
        scopedStateHash = revision.scoped_state_hash;
        scopedState = revision.scoped_state_json;
        baseStateRevision = revision.base_revision;
      }
    }
  }

  const sequenceRows = await sql<{ max: number | null }[]>`
    SELECT MAX(sequence) AS max
    FROM channel_events
    WHERE channel_id = ${row.channel_id}
  `;

  const renderGrant =
    row.render_grant_id === null
      ? null
      : (grants.find((grant) => grant.id === row.render_grant_id) ?? null);

  return {
    instanceId: row.id,
    workspaceId: row.workspace_id,
    channelId: row.channel_id,
    runId: row.run_id,
    runStepId: row.run_step_id,
    agentTurnId: row.agent_turn_id,
    logicalThreadId: row.logical_thread_id,
    componentVersionId: row.component_version_id,
    componentName: row.stable_name,
    componentSemanticVersion: row.semantic_version,
    componentDescriptorHash: row.descriptor_hash,
    rendererKey: row.renderer_key,
    rendererProfileHash,
    rail: "registry_v1",
    status: row.status,
    currentRenderRevision: replayRenderRevision,
    lastGoodRenderRevision: replayLastGoodRenderRevision,
    currentStateRevision: replayStateRevision,
    renderManifestHash,
    validatedPropsHash,
    scopedStateHash,
    validatedProps,
    scopedState,
    baseRenderRevision,
    baseStateRevision,
    textAlternative: row.text_alternative,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    renderGrant,
    dataGrants: grants.filter((grant) => grant.grant_kind === "data"),
    actionGrants: grants.filter((grant) => grant.grant_kind === "action"),
    lastChannelSequence: sequenceRows[0]?.max ?? 0,
  };
}

/**
 * Load the complete replay snapshot under one database transaction. The UI
 * pointers, revisions, grants, and channel cursor must share one snapshot so
 * a concurrent promotion cannot produce a response whose cursor skips it.
 */
export async function loadUiInstanceReplayBundle(
  sql: SqlClient,
  instanceId: string,
): Promise<UiInstanceReplayBundle | null> {
  return sql.begin(async (tx) => {
    await tx`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`;
    return loadUiInstanceReplayBundleFrom(tx, instanceId);
  });
}

export function toUiInstanceReplayResponse(
  bundle: UiInstanceReplayBundle,
  requestId: string,
  now = new Date(),
): UiInstanceReplayResponse {
  if (!bundle.renderGrant) {
    throw new Error(`ui instance ${bundle.instanceId} is missing a render grant`);
  }
  const dataGrants =
    bundle.currentRenderRevision !== null && bundle.renderManifestHash !== null
      ? bundle.dataGrants
          .filter(
            (grant) =>
              grant.bound_render_revision === bundle.currentRenderRevision &&
              grant.bound_manifest_hash === bundle.renderManifestHash &&
              grantIsActive(grant, now),
          )
          .map(mapDataGrant)
          .filter(
            (grant): grant is DataGrantDisclosure =>
              grant !== null && grant.allowedFieldPaths.length > 0,
          )
      : [];
  const dataGrantsById = new Map(dataGrants.map((grant) => [grant.id, grant]));
  const actionGrants =
    bundle.currentRenderRevision !== null && bundle.renderManifestHash !== null
      ? bundle.actionGrants
          .filter(
            (grant) =>
              grant.bound_render_revision === bundle.currentRenderRevision &&
              grant.bound_manifest_hash === bundle.renderManifestHash &&
              grantIsActive(grant, now),
          )
          .map((grant) => mapActionGrant(grant, dataGrantsById))
          .filter(
            (grant): grant is NonNullable<ReturnType<typeof mapActionGrant>> =>
              grant !== null && grant.allowedRenderNodeIds.length > 0,
          )
      : [];

  const sourceRefs = dataGrants.map((grant) => grant.source);

  const renderGrant = mapRenderGrant(bundle.renderGrant);
  const renderGrantActive = grantIsActive(bundle.renderGrant, now);

  return uiInstanceReplayResponseSchema.parse({
    request_id: requestId,
    schemaVersion: 1,
    instanceId: bundle.instanceId,
    workspaceId: bundle.workspaceId,
    channelId: bundle.channelId,
    runId: bundle.runId,
    runStepId: bundle.runStepId,
    agentTurnId: bundle.agentTurnId,
    logicalThreadId: bundle.logicalThreadId,
    componentVersionId: bundle.componentVersionId,
    componentName: bundle.componentName,
    componentVersion: bundle.componentSemanticVersion,
    componentDescriptorHash: bundle.componentDescriptorHash,
    rendererKey: bundle.rendererKey,
    rendererProfileHash: bundle.rendererProfileHash,
    rail: bundle.rail,
    status: bundle.status,
    renderRevision: bundle.currentRenderRevision,
    lastGoodRenderRevision: bundle.lastGoodRenderRevision,
    baseRenderRevision: bundle.baseRenderRevision,
    stateRevision: bundle.currentStateRevision,
    baseStateRevision: bundle.baseStateRevision,
    renderManifestHash: bundle.renderManifestHash,
    validatedPropsHash: bundle.validatedPropsHash,
    scopedStateHash: bundle.scopedStateHash,
    validatedProps: bundle.validatedProps,
    scopedState: bundle.scopedState,
    textAlternative: bundle.textAlternative,
    interactionEnabled: bundle.status === "ready" && renderGrantActive,
    renderGrant,
    dataGrants,
    actionGrants,
    sourceRefs,
    lastChannelSequence: bundle.lastChannelSequence,
    createdAt: bundle.createdAt,
    updatedAt: bundle.updatedAt,
  });
}
