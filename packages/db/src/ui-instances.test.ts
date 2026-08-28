import { describe, expect, it } from "vitest";
import {
  toUiInstanceReplayResponse,
  type SurfaceGrantRow,
  type UiInstanceReplayBundle,
} from "./ui-instances";

const HASH = `sha256:${"ab".repeat(32)}`;
const NOW = "2026-08-25T23:00:00.000Z";
const FUTURE = "2099-01-01T00:00:00.000Z";

function renderGrant(overrides: Partial<SurfaceGrantRow> = {}): SurfaceGrantRow {
  return {
    id: "rg_1",
    grant_kind: "render",
    policy_revision: 1,
    bound_render_revision: null,
    bound_manifest_hash: null,
    rail: "registry_v1",
    allowed_component_types_json: ["table"],
    limits_json: {},
    data_ref: null,
    allowed_field_paths_json: null,
    max_rows: null,
    max_bytes: null,
    snapshot_schema_hash: null,
    immutable_snapshot_hash: null,
    action_ref: null,
    action_mode: null,
    input_schema_hash: null,
    allowed_render_node_ids_json: null,
    linked_data_grant_id: null,
    component_interrupt_id: null,
    grant_body_redacted_json: {},
    grant_scope_hash: HASH,
    max_uses: null,
    use_count: 0,
    expires_at: FUTURE,
    revoked_at: null,
    ...overrides,
  };
}

function baseBundle(overrides: Partial<UiInstanceReplayBundle> = {}): UiInstanceReplayBundle {
  return {
    instanceId: "ui_1",
    workspaceId: "ws_1",
    channelId: "ch_1",
    runId: "run_1",
    runStepId: "step_1",
    agentTurnId: "turn_1",
    logicalThreadId: "thread_1",
    componentVersionId: "compv_1",
    componentName: "DataTable",
    componentSemanticVersion: "1.0.0",
    componentDescriptorHash: HASH,
    rendererKey: "DataTable@1.0.0",
    rendererProfileHash: HASH,
    rail: "registry_v1",
    status: "ready",
    currentRenderRevision: 1,
    lastGoodRenderRevision: 1,
    currentStateRevision: null,
    renderManifestHash: HASH,
    validatedPropsHash: HASH,
    scopedStateHash: null,
    validatedProps: {},
    scopedState: null,
    baseRenderRevision: null,
    baseStateRevision: null,
    textAlternative: "A table of results",
    createdAt: NOW,
    updatedAt: NOW,
    renderGrant: renderGrant(),
    dataGrants: [],
    actionGrants: [],
    lastChannelSequence: 4,
    ...overrides,
  };
}

describe("UIInstance replay mapping", () => {
  it("maps canonical data provenance and server-read bindings", () => {
    const dataGrant: SurfaceGrantRow = {
      ...renderGrant({
        id: "dg_1",
        grant_kind: "data",
        rail: null,
        bound_render_revision: 1,
        bound_manifest_hash: HASH,
        data_ref: "report_rows",
        allowed_field_paths_json: [["rows", "id"]],
        max_rows: 20,
        max_bytes: 4_096,
        snapshot_schema_hash: HASH,
        immutable_snapshot_hash: HASH,
        grant_body_redacted_json: {
          schemaVersion: 1,
          id: "dg_1",
          workspace_id: "ws_1",
          channel_id: "ch_1",
          surface_id: "ui_1",
          policy_revision: 1,
          issued_by: "application_policy",
          expires_at: FUTURE,
          revoked_at: null,
          grant_scope_hash: HASH,
          created_at: NOW,
          kind: "data",
          bound_render_revision: 1,
          bound_manifest_hash: HASH,
          data_ref: "report_rows",
          source: { kind: "query_snapshot", query_key: "reports", snapshot_id: "snap_1" },
          classification: "workspace_safe",
          classification_provenance: "connector policy",
          snapshot_schema_hash: HASH,
          allowed_field_paths: [["rows", "id"]],
          max_rows: 20,
          max_bytes: 4_096,
          redaction_policy_key: "workspace-safe-v1",
          retained_snapshot_blob_key: "snapshots/snap_1",
          immutable_snapshot_hash: HASH,
        },
      }),
    };
    const actionGrant: SurfaceGrantRow = {
      ...renderGrant({
        id: "ag_1",
        grant_kind: "action",
        rail: null,
        bound_render_revision: 1,
        bound_manifest_hash: HASH,
        action_ref: "refresh_rows",
        action_mode: "server_read",
        input_schema_hash: HASH,
        allowed_render_node_ids_json: ["table_1"],
        linked_data_grant_id: "dg_1",
        max_uses: 2,
        grant_body_redacted_json: {
          schemaVersion: 1,
          id: "ag_1",
          workspace_id: "ws_1",
          channel_id: "ch_1",
          surface_id: "ui_1",
          policy_revision: 1,
          issued_by: "application_policy",
          expires_at: FUTURE,
          revoked_at: null,
          grant_scope_hash: HASH,
          created_at: NOW,
          kind: "action",
          bound_render_revision: 1,
          bound_manifest_hash: HASH,
          action_ref: "refresh_rows",
          handler_key: "controlled_ui.refresh_rows.v1",
          input_schema: { type: "object", additionalProperties: false },
          input_schema_hash: HASH,
          allowed_render_node_ids: ["table_1"],
          requires_recent_auth: false,
          requires_trusted_confirmation: false,
          max_uses: 2,
          use_count: 0,
          mode: "server_read",
          data_grant_id: "dg_1",
          data_ref: "report_rows",
          allowed_selection_paths: [],
        },
      }),
    };

    const response = toUiInstanceReplayResponse(
      baseBundle({ dataGrants: [dataGrant], actionGrants: [actionGrant] }),
      "req_1",
    );
    expect(response.dataGrants).toHaveLength(1);
    expect(response.actionGrants).toHaveLength(1);
    const disclosedDataGrant = response.dataGrants[0]!;
    const disclosedActionGrant = response.actionGrants[0]!;

    expect(disclosedDataGrant).toMatchObject({
      id: "dg_1",
      source: { kind: "querySnapshot", snapshotId: "snap_1", snapshotHash: HASH },
      classification: "workspace_safe",
    });
    expect(disclosedActionGrant).toMatchObject({
      id: "ag_1",
      mode: "server_read",
      dataGrantId: "dg_1",
      dataRef: "report_rows",
    });
    expect(response.sourceRefs).toEqual([disclosedDataGrant.source]);

    const expiredResponse = toUiInstanceReplayResponse(
      baseBundle({
        dataGrants: [{ ...dataGrant, expires_at: NOW }],
        actionGrants: [{ ...actionGrant, expires_at: NOW }],
      }),
      "req_expired",
      new Date("2026-08-27T00:00:00.000Z"),
    );
    expect(expiredResponse.dataGrants).toEqual([]);
    expect(expiredResponse.actionGrants).toEqual([]);
    expect(expiredResponse.sourceRefs).toEqual([]);
  });

  it("replays a state-only revision without querying only the render pointer", () => {
    const response = toUiInstanceReplayResponse(
      baseBundle({
        status: "degraded",
        currentRenderRevision: null,
        lastGoodRenderRevision: null,
        currentStateRevision: 2,
        renderManifestHash: null,
        validatedPropsHash: null,
        validatedProps: null,
        scopedStateHash: HASH,
        scopedState: { selectedRow: "row_1" },
        baseStateRevision: 1,
      }),
      "req_2",
    );

    expect(response).toMatchObject({
      status: "degraded",
      renderRevision: null,
      stateRevision: 2,
      scopedState: { selectedRow: "row_1" },
      interactionEnabled: false,
    });
  });

  it("keeps replay available but disables interaction for revoked render authority", () => {
    const response = toUiInstanceReplayResponse(
      baseBundle({ renderGrant: renderGrant({ revoked_at: NOW }) }),
      "req_3",
    );

    expect(response.status).toBe("ready");
    expect(response.renderGrant.revoked).toBe(true);
    expect(response.interactionEnabled).toBe(false);
  });
});
