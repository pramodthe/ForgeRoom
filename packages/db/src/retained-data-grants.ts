import { canonicalizeJson } from "@forgeroom/domain";
import { dataGrantSchema, type DataGrant } from "@forgeroom/contracts";
import type postgres from "postgres";

type SqlExecutor = postgres.Sql | postgres.TransactionSql;

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

export function getValueAtFieldPath(root: unknown, path: readonly string[]): unknown {
  let current = root;
  for (const segment of path) {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function setValueAtFieldPath(
  target: Record<string, unknown>,
  path: readonly string[],
  value: unknown,
): void {
  if (path.length === 0) {
    return;
  }
  let current: Record<string, unknown> = target;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index]!;
    const next = current[segment];
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      const created: Record<string, unknown> = {};
      current[segment] = created;
      current = created;
    } else {
      current = next as Record<string, unknown>;
    }
  }
  current[path[path.length - 1]!] = value;
}

export function pickAllowedFieldPaths(
  snapshot: unknown,
  allowedPaths: readonly (readonly string[])[],
): unknown {
  if (typeof snapshot !== "object" || snapshot === null) {
    return null;
  }
  const result: Record<string, unknown> = {};
  for (const path of allowedPaths) {
    if (path.length === 0) {
      continue;
    }
    if (path.length === 1) {
      const value = getValueAtFieldPath(snapshot, path);
      if (value !== undefined) {
        result[path[0]!] = value;
      }
      continue;
    }
    const [head, ...rest] = path;
    const container = getValueAtFieldPath(snapshot, [head!]);
    if (Array.isArray(container)) {
      const existingRows = Array.isArray(result[head!]) ? (result[head!] as unknown[]) : [];
      result[head!] = container.map((entry, index) => {
        const merged =
          typeof existingRows[index] === "object" &&
          existingRows[index] !== null &&
          !Array.isArray(existingRows[index])
            ? { ...(existingRows[index] as Record<string, unknown>) }
            : {};
        const value =
          typeof entry === "object" && entry !== null
            ? getValueAtFieldPath(entry, rest)
            : undefined;
        if (value !== undefined) {
          setValueAtFieldPath(merged, rest, value);
        }
        return merged;
      });
      continue;
    }
    const value = getValueAtFieldPath(snapshot, path);
    if (value !== undefined) {
      setValueAtFieldPath(result, path, value);
    }
  }
  return result;
}

export function applySnapshotLimits(
  value: unknown,
  limits: { maxRows: number; maxBytes: number },
): unknown {
  let limited = value;
  if (typeof limited === "object" && limited !== null && !Array.isArray(limited)) {
    const record = { ...(limited as Record<string, unknown>) };
    for (const [key, entry] of Object.entries(record)) {
      if (Array.isArray(entry) && limits.maxRows >= 0) {
        record[key] = entry.slice(0, limits.maxRows);
      }
    }
    limited = record;
  }
  const encoded = canonicalizeJson(limited);
  if (Buffer.byteLength(encoded, "utf8") > limits.maxBytes) {
    throw new Error("Retained snapshot exceeds granted byte limit after filtering.");
  }
  return limited;
}

export type RetainedDataGrantRow = {
  id: string;
  bound_render_revision: number | null;
  bound_manifest_hash: string | null;
  data_ref: string | null;
  max_rows: number | null;
  max_bytes: number | null;
  immutable_snapshot_hash: string | null;
  grant_body_redacted_json: unknown;
  max_uses: number | null;
  use_count: number;
  expires_at: string | Date;
  revoked_at: string | Date | null;
};

export function dataGrantMatchesRow(grant: DataGrant, row: RetainedDataGrantRow): boolean {
  return (
    grant.id === row.id &&
    grant.bound_render_revision === row.bound_render_revision &&
    grant.bound_manifest_hash === row.bound_manifest_hash &&
    grant.data_ref === row.data_ref &&
    grant.immutable_snapshot_hash === row.immutable_snapshot_hash
  );
}

export function dataGrantIsActive(row: RetainedDataGrantRow, now: Date): boolean {
  return (
    row.revoked_at === null &&
    new Date(row.expires_at).getTime() > now.getTime() &&
    (row.max_uses === null || row.use_count < row.max_uses)
  );
}

export async function loadRetainedDataGrantSnapshot(
  tx: SqlExecutor,
  input: {
    uiInstanceId: string;
    dataGrantId: string;
    expectedRenderRevision: number;
    expectedManifestHash: string;
    expectedDataRef: string;
    now: string;
  },
): Promise<
  | { ok: true; dataGrant: DataGrant; snapshot: unknown }
  | { ok: false; code: "not_found" | "validation_failed"; message: string }
> {
  const grants = await tx<RetainedDataGrantRow[]>`
    SELECT
      id, bound_render_revision, bound_manifest_hash, data_ref, max_rows, max_bytes,
      immutable_snapshot_hash, grant_body_redacted_json, max_uses, use_count, expires_at, revoked_at
    FROM ui_surface_grants
    WHERE id = ${input.dataGrantId}
      AND ui_instance_id = ${input.uiInstanceId}
      AND grant_kind = 'data'
    FOR UPDATE
  `;
  const row = grants[0];
  if (!row) {
    return { ok: false, code: "not_found", message: "DataGrant not found." };
  }
  const parsed = dataGrantSchema.safeParse(parseJson(row.grant_body_redacted_json));
  if (!parsed.success || !dataGrantMatchesRow(parsed.data, row)) {
    return {
      ok: false,
      code: "validation_failed",
      message: "DataGrant authority is invalid.",
    };
  }
  const dataGrant = parsed.data;
  if (
    row.bound_render_revision !== input.expectedRenderRevision ||
    row.bound_manifest_hash !== input.expectedManifestHash ||
    dataGrant.data_ref !== input.expectedDataRef
  ) {
    return {
      ok: false,
      code: "validation_failed",
      message: "DataGrant binding is invalid.",
    };
  }
  if (!row.immutable_snapshot_hash) {
    return {
      ok: false,
      code: "validation_failed",
      message: "DataGrant snapshot hash is missing.",
    };
  }
  if (!dataGrantIsActive(row, new Date(input.now))) {
    return {
      ok: false,
      code: "validation_failed",
      message: "DataGrant is inactive.",
    };
  }

  const revisions = await tx<{ data_snapshot_json: unknown }[]>`
    SELECT data_snapshot_json
    FROM ui_instance_revisions
    WHERE ui_instance_id = ${input.uiInstanceId}
      AND revision_kind = 'render'
      AND revision = ${input.expectedRenderRevision}
      AND data_snapshot_hash = ${row.immutable_snapshot_hash}
      AND validation_state = 'valid'
      AND promoted_at IS NOT NULL
    LIMIT 1
  `;
  const snapshot = revisions[0]?.data_snapshot_json;
  if (snapshot === null || snapshot === undefined) {
    return {
      ok: false,
      code: "not_found",
      message: "Retained DataGrant snapshot is unavailable.",
    };
  }

  return { ok: true, dataGrant, snapshot: parseJson(snapshot) };
}

export function resolveRetainedDataGrantRead(input: {
  snapshot: unknown;
  dataGrant: DataGrant;
  allowedSelectionPaths: readonly (readonly string[])[];
}): unknown {
  const filtered = pickAllowedFieldPaths(input.snapshot, input.dataGrant.allowed_field_paths);
  const selectionPaths =
    input.allowedSelectionPaths.length > 0
      ? input.allowedSelectionPaths
      : input.dataGrant.allowed_field_paths;
  const selected = pickAllowedFieldPaths(filtered, selectionPaths);
  return applySnapshotLimits(selected, {
    maxRows: input.dataGrant.max_rows,
    maxBytes: input.dataGrant.max_bytes,
  });
}
