import { describe, expect, it } from "vitest";
import { executeUiDataFunctionHandler } from "./ui-data-function-handlers";

describe("UI data function handlers", () => {
  it("returns bounded rows from the retained snapshot", () => {
    const data = executeUiDataFunctionHandler("rows", {
      snapshot: {
        rows: [
          { record_id: "demo-rec-001", status: "open", owner: "fixture" },
          { record_id: "demo-rec-002", status: "ready", owner: "fixture" },
        ],
      },
      dataGrant: {
        schemaVersion: 1,
        id: "dg_rows",
        workspace_id: "ws_1",
        channel_id: "ch_1",
        surface_id: "ui_1",
        policy_revision: 1,
        issued_by: "application_policy",
        expires_at: "2099-01-01T00:00:00.000Z",
        revoked_at: null,
        grant_scope_hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        created_at: "2026-08-25T23:00:00.000Z",
        kind: "data",
        bound_render_revision: 1,
        bound_manifest_hash:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        data_ref: "rows",
        source: { kind: "query_snapshot", query_key: "component.rows", snapshot_id: "snap_1" },
        classification: "synthetic",
        classification_provenance: "component_tool_broker",
        snapshot_schema_hash:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        allowed_field_paths: [
          ["rows", "record_id"],
          ["rows", "status"],
        ],
        max_rows: 25,
        max_bytes: 4096,
        max_time_ms: 1_000,
        redaction_policy_key: "workspace-safe-v1",
        retained_snapshot_blob_key: "snapshots/dg_rows",
        immutable_snapshot_hash:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      arguments: {},
      startedAtMs: Date.now(),
    });

    expect(data).toEqual({
      rows: [
        { record_id: "demo-rec-001", status: "open" },
        { record_id: "demo-rec-002", status: "ready" },
      ],
    });
  });

  it("returns bounded series from the retained snapshot", () => {
    const data = executeUiDataFunctionHandler("series", {
      snapshot: {
        series: [{ key: "count", label: "Records", points: [{ x: "open", y: 1 }] }],
      },
      dataGrant: {
        schemaVersion: 1,
        id: "dg_series",
        workspace_id: "ws_1",
        channel_id: "ch_1",
        surface_id: "ui_1",
        policy_revision: 1,
        issued_by: "application_policy",
        expires_at: "2099-01-01T00:00:00.000Z",
        revoked_at: null,
        grant_scope_hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        created_at: "2026-08-25T23:00:00.000Z",
        kind: "data",
        bound_render_revision: 1,
        bound_manifest_hash:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        data_ref: "series",
        source: { kind: "query_snapshot", query_key: "component.series", snapshot_id: "snap_1" },
        classification: "synthetic",
        classification_provenance: "component_tool_broker",
        snapshot_schema_hash:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        allowed_field_paths: [["series"]],
        max_rows: 25,
        max_bytes: 4096,
        max_time_ms: 1_000,
        redaction_policy_key: "workspace-safe-v1",
        retained_snapshot_blob_key: "snapshots/dg_series",
        immutable_snapshot_hash:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      arguments: {},
      startedAtMs: Date.now(),
    });

    expect(data).toEqual({
      series: [{ key: "count", label: "Records", points: [{ x: "open", y: 1 }] }],
    });
  });

  it("surfaces an attributed bytes limit error from the handler path", () => {
    expect(() =>
      executeUiDataFunctionHandler("rows", {
        snapshot: {
          rows: [{ record_id: "demo-rec-001", status: "open", owner: "fixture-owner" }],
        },
        dataGrant: {
          schemaVersion: 1,
          id: "dg_rows",
          workspace_id: "ws_1",
          channel_id: "ch_1",
          surface_id: "ui_1",
          policy_revision: 1,
          issued_by: "application_policy",
          expires_at: "2099-01-01T00:00:00.000Z",
          revoked_at: null,
          grant_scope_hash:
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          created_at: "2026-08-25T23:00:00.000Z",
          kind: "data",
          bound_render_revision: 1,
          bound_manifest_hash:
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          data_ref: "rows",
          source: { kind: "query_snapshot", query_key: "component.rows", snapshot_id: "snap_1" },
          classification: "synthetic",
          classification_provenance: "component_tool_broker",
          snapshot_schema_hash:
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          allowed_field_paths: [
            ["rows", "record_id"],
            ["rows", "status"],
            ["rows", "owner"],
          ],
          max_rows: 25,
          max_bytes: 1,
          max_time_ms: 1_000,
          redaction_policy_key: "workspace-safe-v1",
          retained_snapshot_blob_key: "snapshots/dg_rows",
          immutable_snapshot_hash:
            "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        arguments: {},
        startedAtMs: Date.now(),
      }),
    ).toThrow(/bytes/);
  });
});
