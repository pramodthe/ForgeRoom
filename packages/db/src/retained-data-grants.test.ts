import { describe, expect, it } from "vitest";
import {
  applySnapshotLimits,
  getValueAtFieldPath,
  pickAllowedFieldPaths,
  resolveRetainedDataGrantRead,
} from "./retained-data-grants";

describe("retained DataGrant resolution", () => {
  const snapshot = {
    rows: [
      { id: "row_1", status: "open" },
      { id: "row_2", status: "ready" },
    ],
  };

  it("picks only granted field paths", () => {
    expect(
      pickAllowedFieldPaths(snapshot, [
        ["rows", "id"],
      ]),
    ).toEqual({
      rows: [{ id: "row_1" }, { id: "row_2" }],
    });
  });

  it("reads nested values through literal field paths", () => {
    expect(getValueAtFieldPath(snapshot, ["rows", "id"])).toBeUndefined();
    expect(getValueAtFieldPath(snapshot, ["rows"])).toEqual(snapshot.rows);
  });

  it("applies row and byte limits", () => {
    expect(
      applySnapshotLimits(snapshot, {
        maxRows: 1,
        maxBytes: 10_000,
      }),
    ).toEqual({
      rows: [{ id: "row_1", status: "open" }],
    });
  });

  it("resolves a server_read payload from the retained snapshot", () => {
    const resolved = resolveRetainedDataGrantRead({
      snapshot,
      dataGrant: {
        schemaVersion: 1,
        id: "dg_1",
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
        data_ref: "report_rows",
        source: { kind: "query_snapshot", query_key: "reports", snapshot_id: "snap_1" },
        classification: "workspace_safe",
        classification_provenance: "connector policy",
        snapshot_schema_hash:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        allowed_field_paths: [["rows", "id"], ["rows", "status"]],
        max_rows: 20,
        max_bytes: 4_096,
        redaction_policy_key: "workspace-safe-v1",
        retained_snapshot_blob_key: "snapshots/snap_1",
        immutable_snapshot_hash:
          "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      allowedSelectionPaths: [],
    });

    expect(resolved).toEqual({
      rows: [
        { id: "row_1", status: "open" },
        { id: "row_2", status: "ready" },
      ],
    });
  });
});
