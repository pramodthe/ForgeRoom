import { describe, expect, it, vi } from "vitest";
import { invokeUiDataFunction } from "./ui-data-functions";
import { HASH, NOW, seedRuntime, withMigratedDatabase } from "./test-harness";

const TEST_NOW = "2020-01-01T00:00:00.000Z";

describe("UI data functions", () => {
  it("returns bounded rows from the retained snapshot when the rows handler is registered", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const snapshot = { rows: [{ id: "row_1", status: "open" }] };
      const dataGrantBody = {
        schemaVersion: 1,
        id: "dg_rows",
        workspace_id: "ws_1",
        channel_id: "ch_1",
        surface_id: "ui_1",
        policy_revision: 1,
        issued_by: "application_policy",
        expires_at: NOW,
        revoked_at: null,
        grant_scope_hash: HASH,
        created_at: NOW,
        kind: "data",
        bound_render_revision: 0,
        bound_manifest_hash: HASH,
        data_ref: "rows",
        source: { kind: "query_snapshot", query_key: "reports", snapshot_id: "snap_1" },
        classification: "workspace_safe",
        classification_provenance: "fixture",
        snapshot_schema_hash: HASH,
        allowed_field_paths: [["rows", "id"]],
        max_rows: 20,
        max_bytes: 4096,
        max_time_ms: 1_000,
        redaction_policy_key: "workspace-safe-v1",
        retained_snapshot_blob_key: "snapshots/snap_1",
        immutable_snapshot_hash: HASH,
      };
      await sql`
        INSERT INTO ui_instance_revisions (
          id, ui_instance_id, revision_kind, revision, component_version_id, renderer_profile_hash,
          validator_policy_version, render_node_set_json, render_node_set_hash, render_payload_json,
          render_payload_hash, render_manifest_json, manifest_hash, validated_props_json, validated_props_hash,
          accessible_summary, content_hash, data_snapshot_json, data_snapshot_hash, validation_state,
          created_at, promoted_at
        ) VALUES (
          'uirev_rows_0', 'ui_1', 'render', 0, 'compv_1', ${HASH},
          'registry_v1', '[{"nodeId":"node_1"}]'::jsonb, ${HASH}, '{}'::jsonb,
          ${HASH}, '{}'::jsonb, ${HASH}, '{}'::jsonb, ${HASH},
          'A table', ${HASH}, ${JSON.stringify(snapshot)}::jsonb, ${HASH}, 'valid', ${NOW}, ${NOW}
        )
      `;
      await sql`
        UPDATE ui_instances
        SET status = 'ready', current_render_revision = 0, last_good_render_revision = 0,
            ready_at = ${NOW}, updated_at = ${NOW}
        WHERE id = 'ui_1'
      `;
      await sql`
        INSERT INTO ui_surface_grants (
          id, ui_instance_id, grant_kind, policy_revision, bound_render_revision, bound_manifest_hash,
          data_ref, allowed_field_paths_json, snapshot_schema_hash, immutable_snapshot_hash,
          grant_body_redacted_json, grant_scope_hash, issued_by, expires_at, created_at
        ) VALUES (
          'dg_rows', 'ui_1', 'data', 1, 0, ${HASH}, 'rows', '[["rows","id"]]'::jsonb, ${HASH}, ${HASH},
          ${JSON.stringify(dataGrantBody)}::jsonb, ${HASH}, 'application_policy', ${NOW}, ${NOW}
        )
      `;
      await sql`
        INSERT INTO ui_data_function_grants (
          id, component_version_id, function_name, workspace_id, limits_json, granted_by, granted_at
        ) VALUES (
          'dfg_rows', 'compv_1', 'rows', 'ws_1', '{}'::jsonb, 'user_1', ${NOW}
        )
      `;

      const result = await invokeUiDataFunction(sql, {
        instanceId: "ui_1",
        workspaceId: "ws_1",
        actorUserId: "user_1",
        functionName: "rows",
        renderRevision: 0,
        dataGrantId: "dg_rows",
        expectedManifestHash: HASH,
        arguments: {},
        now: TEST_NOW,
      });
      expect(result).toEqual({
        ok: true,
        data: {
          rows: [{ id: "row_1" }],
        },
      });
    });
  }, 60_000);

  it("denies invocation when the function name does not match the DataGrant data_ref", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const snapshot = { rows: [{ id: "row_1", status: "open" }] };
      const dataGrantBody = {
        schemaVersion: 1,
        id: "dg_rows",
        workspace_id: "ws_1",
        channel_id: "ch_1",
        surface_id: "ui_1",
        policy_revision: 1,
        issued_by: "application_policy",
        expires_at: NOW,
        revoked_at: null,
        grant_scope_hash: HASH,
        created_at: NOW,
        kind: "data",
        bound_render_revision: 0,
        bound_manifest_hash: HASH,
        data_ref: "series",
        source: { kind: "query_snapshot", query_key: "reports", snapshot_id: "snap_1" },
        classification: "workspace_safe",
        classification_provenance: "fixture",
        snapshot_schema_hash: HASH,
        allowed_field_paths: [["rows", "id"]],
        max_rows: 20,
        max_bytes: 4096,
        max_time_ms: 1_000,
        redaction_policy_key: "workspace-safe-v1",
        retained_snapshot_blob_key: "snapshots/snap_1",
        immutable_snapshot_hash: HASH,
      };
      await sql`
        INSERT INTO ui_instance_revisions (
          id, ui_instance_id, revision_kind, revision, component_version_id, renderer_profile_hash,
          validator_policy_version, render_node_set_json, render_node_set_hash, render_payload_json,
          render_payload_hash, render_manifest_json, manifest_hash, validated_props_json, validated_props_hash,
          accessible_summary, content_hash, data_snapshot_json, data_snapshot_hash, validation_state,
          created_at, promoted_at
        ) VALUES (
          'uirev_rows_mismatch', 'ui_1', 'render', 0, 'compv_1', ${HASH},
          'registry_v1', '[{"nodeId":"node_1"}]'::jsonb, ${HASH}, '{}'::jsonb,
          ${HASH}, '{}'::jsonb, ${HASH}, '{}'::jsonb, ${HASH},
          'A table', ${HASH}, ${JSON.stringify(snapshot)}::jsonb, ${HASH}, 'valid', ${NOW}, ${NOW}
        )
      `;
      await sql`
        UPDATE ui_instances
        SET status = 'ready', current_render_revision = 0, last_good_render_revision = 0,
            ready_at = ${NOW}, updated_at = ${NOW}
        WHERE id = 'ui_1'
      `;
      await sql`
        INSERT INTO ui_surface_grants (
          id, ui_instance_id, grant_kind, policy_revision, bound_render_revision, bound_manifest_hash,
          data_ref, allowed_field_paths_json, snapshot_schema_hash, immutable_snapshot_hash,
          grant_body_redacted_json, grant_scope_hash, issued_by, expires_at, created_at
        ) VALUES (
          'dg_rows', 'ui_1', 'data', 1, 0, ${HASH}, 'series', '[["rows","id"]]'::jsonb, ${HASH}, ${HASH},
          ${JSON.stringify(dataGrantBody)}::jsonb, ${HASH}, 'application_policy', ${NOW}, ${NOW}
        )
      `;
      await sql`
        INSERT INTO ui_data_function_grants (
          id, component_version_id, function_name, workspace_id, limits_json, granted_by, granted_at
        ) VALUES (
          'dfg_rows', 'compv_1', 'rows', 'ws_1', '{}'::jsonb, 'user_1', ${NOW}
        )
      `;

      const result = await invokeUiDataFunction(sql, {
        instanceId: "ui_1",
        workspaceId: "ws_1",
        actorUserId: "user_1",
        functionName: "rows",
        renderRevision: 0,
        dataGrantId: "dg_rows",
        expectedManifestHash: HASH,
        arguments: {},
        now: TEST_NOW,
      });
      expect(result).toEqual({
        ok: false,
        code: "ui_interaction_not_allowed",
        message: "DataGrant binding is invalid.",
      });
    });
  }, 60_000);

  it("denies invocation for an unregistered data-function name", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const snapshot = { metrics: { count: 1 } };
      const dataGrantBody = {
        schemaVersion: 1,
        id: "dg_metrics",
        workspace_id: "ws_1",
        channel_id: "ch_1",
        surface_id: "ui_1",
        policy_revision: 1,
        issued_by: "application_policy",
        expires_at: NOW,
        revoked_at: null,
        grant_scope_hash: HASH,
        created_at: NOW,
        kind: "data",
        bound_render_revision: 0,
        bound_manifest_hash: HASH,
        data_ref: "metrics",
        source: { kind: "query_snapshot", query_key: "metrics", snapshot_id: "snap_1" },
        classification: "workspace_safe",
        classification_provenance: "fixture",
        snapshot_schema_hash: HASH,
        allowed_field_paths: [["metrics", "count"]],
        max_rows: 20,
        max_bytes: 4096,
        max_time_ms: 1_000,
        redaction_policy_key: "workspace-safe-v1",
        retained_snapshot_blob_key: "snapshots/snap_1",
        immutable_snapshot_hash: HASH,
      };
      await sql`
        INSERT INTO ui_instance_revisions (
          id, ui_instance_id, revision_kind, revision, component_version_id, renderer_profile_hash,
          validator_policy_version, render_node_set_json, render_node_set_hash, render_payload_json,
          render_payload_hash, render_manifest_json, manifest_hash, validated_props_json, validated_props_hash,
          accessible_summary, content_hash, data_snapshot_json, data_snapshot_hash, validation_state,
          created_at, promoted_at
        ) VALUES (
          'uirev_metrics_0', 'ui_1', 'render', 0, 'compv_1', ${HASH},
          'registry_v1', '[{"nodeId":"node_1"}]'::jsonb, ${HASH}, '{}'::jsonb,
          ${HASH}, '{}'::jsonb, ${HASH}, '{}'::jsonb, ${HASH},
          'Metrics', ${HASH}, ${JSON.stringify(snapshot)}::jsonb, ${HASH}, 'valid', ${NOW}, ${NOW}
        )
      `;
      await sql`
        UPDATE ui_instances
        SET status = 'ready', current_render_revision = 0, last_good_render_revision = 0,
            ready_at = ${NOW}, updated_at = ${NOW}
        WHERE id = 'ui_1'
      `;
      await sql`
        INSERT INTO ui_surface_grants (
          id, ui_instance_id, grant_kind, policy_revision, bound_render_revision, bound_manifest_hash,
          data_ref, allowed_field_paths_json, snapshot_schema_hash, immutable_snapshot_hash,
          grant_body_redacted_json, grant_scope_hash, issued_by, expires_at, created_at
        ) VALUES (
          'dg_metrics', 'ui_1', 'data', 1, 0, ${HASH}, 'metrics', '[["metrics","count"]]'::jsonb, ${HASH}, ${HASH},
          ${JSON.stringify(dataGrantBody)}::jsonb, ${HASH}, 'application_policy', ${NOW}, ${NOW}
        )
      `;
      await sql`
        INSERT INTO ui_data_function_grants (
          id, component_version_id, function_name, workspace_id, limits_json, granted_by, granted_at
        ) VALUES (
          'dfg_metrics', 'compv_1', 'metrics', 'ws_1', '{}'::jsonb, 'user_1', ${NOW}
        )
      `;

      const result = await invokeUiDataFunction(sql, {
        instanceId: "ui_1",
        workspaceId: "ws_1",
        actorUserId: "user_1",
        functionName: "metrics",
        renderRevision: 0,
        dataGrantId: "dg_metrics",
        expectedManifestHash: HASH,
        arguments: {},
        now: TEST_NOW,
      });
      expect(result).toEqual({
        ok: false,
        code: "ui_interaction_not_allowed",
        message: "Data-function handler is not registered.",
      });
    });
  }, 60_000);

  it("returns an attributed bytes limit error when the retained read exceeds max_bytes", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const snapshot = {
        rows: [{ id: "row_1", status: "open", owner: "fixture-owner-name" }],
      };
      const dataGrantBody = {
        schemaVersion: 1,
        id: "dg_bytes",
        workspace_id: "ws_1",
        channel_id: "ch_1",
        surface_id: "ui_1",
        policy_revision: 1,
        issued_by: "application_policy",
        expires_at: NOW,
        revoked_at: null,
        grant_scope_hash: HASH,
        created_at: NOW,
        kind: "data",
        bound_render_revision: 0,
        bound_manifest_hash: HASH,
        data_ref: "rows",
        source: { kind: "query_snapshot", query_key: "reports", snapshot_id: "snap_1" },
        classification: "workspace_safe",
        classification_provenance: "fixture",
        snapshot_schema_hash: HASH,
        allowed_field_paths: [
          ["rows", "id"],
          ["rows", "status"],
          ["rows", "owner"],
        ],
        max_rows: 20,
        max_bytes: 1,
        max_time_ms: 1_000,
        redaction_policy_key: "workspace-safe-v1",
        retained_snapshot_blob_key: "snapshots/snap_1",
        immutable_snapshot_hash: HASH,
      };
      await sql`
        INSERT INTO ui_instance_revisions (
          id, ui_instance_id, revision_kind, revision, component_version_id, renderer_profile_hash,
          validator_policy_version, render_node_set_json, render_node_set_hash, render_payload_json,
          render_payload_hash, render_manifest_json, manifest_hash, validated_props_json, validated_props_hash,
          accessible_summary, content_hash, data_snapshot_json, data_snapshot_hash, validation_state,
          created_at, promoted_at
        ) VALUES (
          'uirev_bytes_0', 'ui_1', 'render', 0, 'compv_1', ${HASH},
          'registry_v1', '[{"nodeId":"node_1"}]'::jsonb, ${HASH}, '{}'::jsonb,
          ${HASH}, '{}'::jsonb, ${HASH}, '{}'::jsonb, ${HASH},
          'A table', ${HASH}, ${JSON.stringify(snapshot)}::jsonb, ${HASH}, 'valid', ${NOW}, ${NOW}
        )
      `;
      await sql`
        UPDATE ui_instances
        SET status = 'ready', current_render_revision = 0, last_good_render_revision = 0,
            ready_at = ${NOW}, updated_at = ${NOW}
        WHERE id = 'ui_1'
      `;
      await sql`
        INSERT INTO ui_surface_grants (
          id, ui_instance_id, grant_kind, policy_revision, bound_render_revision, bound_manifest_hash,
          data_ref, allowed_field_paths_json, snapshot_schema_hash, immutable_snapshot_hash,
          grant_body_redacted_json, grant_scope_hash, issued_by, expires_at, created_at
        ) VALUES (
          'dg_bytes', 'ui_1', 'data', 1, 0, ${HASH}, 'rows',
          '[["rows","id"],["rows","status"],["rows","owner"]]'::jsonb, ${HASH}, ${HASH},
          ${JSON.stringify(dataGrantBody)}::jsonb, ${HASH}, 'application_policy', ${NOW}, ${NOW}
        )
      `;
      await sql`
        INSERT INTO ui_data_function_grants (
          id, component_version_id, function_name, workspace_id, limits_json, granted_by, granted_at
        ) VALUES (
          'dfg_rows_bytes', 'compv_1', 'rows', 'ws_1', '{}'::jsonb, 'user_1', ${NOW}
        )
      `;

      const result = await invokeUiDataFunction(sql, {
        instanceId: "ui_1",
        workspaceId: "ws_1",
        actorUserId: "user_1",
        functionName: "rows",
        renderRevision: 0,
        dataGrantId: "dg_bytes",
        expectedManifestHash: HASH,
        arguments: {},
        now: TEST_NOW,
      });
      expect(result).toEqual({
        ok: false,
        code: "ui_interaction_not_allowed",
        message: "DataGrant bytes limit exceeded.",
      });
    });
  }, 60_000);

  it("returns a time_ms limit error from the retained grant on replay", async () => {
    const nowSpy = vi.spyOn(Date, "now");
    let calls = 0;
    nowSpy.mockImplementation(() => {
      calls += 1;
      return calls === 1 ? 0 : 10;
    });
    try {
      await withMigratedDatabase(async (sql) => {
        await seedRuntime(sql);
        const snapshot = { rows: [{ id: "row_1", status: "open" }] };
        const dataGrantBody = {
          schemaVersion: 1,
          id: "dg_time",
          workspace_id: "ws_1",
          channel_id: "ch_1",
          surface_id: "ui_1",
          policy_revision: 1,
          issued_by: "application_policy",
          expires_at: NOW,
          revoked_at: null,
          grant_scope_hash: HASH,
          created_at: NOW,
          kind: "data",
          bound_render_revision: 0,
          bound_manifest_hash: HASH,
          data_ref: "rows",
          source: { kind: "query_snapshot", query_key: "reports", snapshot_id: "snap_1" },
          classification: "workspace_safe",
          classification_provenance: "fixture",
          snapshot_schema_hash: HASH,
          allowed_field_paths: [["rows", "id"]],
          max_rows: 20,
          max_bytes: 4096,
          max_time_ms: 1,
          redaction_policy_key: "workspace-safe-v1",
          retained_snapshot_blob_key: "snapshots/snap_1",
          immutable_snapshot_hash: HASH,
        };
        await sql`
          INSERT INTO ui_instance_revisions (
            id, ui_instance_id, revision_kind, revision, component_version_id, renderer_profile_hash,
            validator_policy_version, render_node_set_json, render_node_set_hash, render_payload_json,
            render_payload_hash, render_manifest_json, manifest_hash, validated_props_json, validated_props_hash,
            accessible_summary, content_hash, data_snapshot_json, data_snapshot_hash, validation_state,
            created_at, promoted_at
          ) VALUES (
            'uirev_time_0', 'ui_1', 'render', 0, 'compv_1', ${HASH},
            'registry_v1', '[{"nodeId":"node_1"}]'::jsonb, ${HASH}, '{}'::jsonb,
            ${HASH}, '{}'::jsonb, ${HASH}, '{}'::jsonb, ${HASH},
            'A table', ${HASH}, ${JSON.stringify(snapshot)}::jsonb, ${HASH}, 'valid', ${NOW}, ${NOW}
          )
        `;
        await sql`
          UPDATE ui_instances
          SET status = 'ready', current_render_revision = 0, last_good_render_revision = 0,
              ready_at = ${NOW}, updated_at = ${NOW}
          WHERE id = 'ui_1'
        `;
        await sql`
          INSERT INTO ui_surface_grants (
            id, ui_instance_id, grant_kind, policy_revision, bound_render_revision, bound_manifest_hash,
            data_ref, allowed_field_paths_json, snapshot_schema_hash, immutable_snapshot_hash,
            grant_body_redacted_json, grant_scope_hash, issued_by, expires_at, created_at
          ) VALUES (
            'dg_time', 'ui_1', 'data', 1, 0, ${HASH}, 'rows', '[["rows","id"]]'::jsonb, ${HASH}, ${HASH},
            ${JSON.stringify(dataGrantBody)}::jsonb, ${HASH}, 'application_policy', ${NOW}, ${NOW}
          )
        `;
        await sql`
          INSERT INTO ui_data_function_grants (
            id, component_version_id, function_name, workspace_id, limits_json, granted_by, granted_at
          ) VALUES (
            'dfg_rows_time', 'compv_1', 'rows', 'ws_1', '{}'::jsonb, 'user_1', ${NOW}
          )
        `;

        const result = await invokeUiDataFunction(sql, {
          instanceId: "ui_1",
          workspaceId: "ws_1",
          actorUserId: "user_1",
          functionName: "rows",
          renderRevision: 0,
          dataGrantId: "dg_time",
          expectedManifestHash: HASH,
          arguments: {},
          now: TEST_NOW,
        });
        expect(result).toEqual({
          ok: false,
          code: "ui_interaction_not_allowed",
          message: "DataGrant time_ms limit exceeded.",
        });
      });
    } finally {
      nowSpy.mockRestore();
    }
  }, 60_000);
});
