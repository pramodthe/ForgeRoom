import { createHash, randomBytes } from "node:crypto";
import type postgres from "postgres";
import { canonicalizeJson, getRegistryDefinition } from "@forgeroom/domain";

type SqlClient = postgres.Sql | postgres.TransactionSql;

const DEFAULT_MAX_ROWS = 25;
const DEFAULT_MAX_BYTES = 4096;

function opaqueId(prefix: string): string {
  return `${prefix}_${randomBytes(10).toString("hex")}`;
}

function hashText(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function grantExpiresAt(now: string): string {
  return new Date(Date.parse(now) + 24 * 60 * 60 * 1000).toISOString();
}

function readLimits(value: unknown): { maxRows: number; maxBytes: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { maxRows: DEFAULT_MAX_ROWS, maxBytes: DEFAULT_MAX_BYTES };
  }
  const record = value as Record<string, unknown>;
  const maxRows =
    typeof record.max_rows === "number" && Number.isInteger(record.max_rows) && record.max_rows >= 0
      ? record.max_rows
      : DEFAULT_MAX_ROWS;
  const maxBytes =
    typeof record.max_bytes === "number" &&
    Number.isInteger(record.max_bytes) &&
    record.max_bytes >= 0
      ? record.max_bytes
      : DEFAULT_MAX_BYTES;
  return { maxRows, maxBytes };
}

function rowsAllowedFieldPaths(props: Record<string, unknown>): string[][] {
  const columns = props.columns;
  if (!Array.isArray(columns)) {
    return [["rows"]];
  }
  const paths: string[][] = [];
  for (const column of columns) {
    if (
      column &&
      typeof column === "object" &&
      typeof (column as { key?: unknown }).key === "string"
    ) {
      paths.push(["rows", (column as { key: string }).key]);
    }
  }
  return paths.length > 0 ? paths : [["rows"]];
}

function initialSnapshotForFunction(
  functionName: string,
  props: Record<string, unknown>,
): Record<string, unknown> {
  if (functionName === "rows") {
    void props;
    return { rows: [] };
  }
  return { [functionName]: null };
}

export type BrokerDataGrantPlan = {
  snapshot: Record<string, unknown> | null;
  grants: Array<{
    functionName: string;
    dataRef: string;
    allowedFieldPaths: string[][];
    maxRows: number;
    maxBytes: number;
  }>;
};

export async function planBrokerDataGrants(
  sql: SqlClient,
  input: {
    workspaceId: string;
    channelId: string;
    coworkerId: string;
    componentVersionId: string;
    stableName: string;
    validatedProps: Record<string, unknown>;
  },
): Promise<BrokerDataGrantPlan> {
  const definition = getRegistryDefinition(input.stableName);
  const declaredFunctions = definition?.declaredDataFunctions ?? [];
  if (declaredFunctions.length === 0) {
    return { snapshot: null, grants: [] };
  }

  const registryGrants = await sql<{ function_name: string; limits_json: unknown }[]>`
    SELECT function_name, limits_json
    FROM ui_data_function_grants
    WHERE component_version_id = ${input.componentVersionId}
      AND workspace_id = ${input.workspaceId}
      AND revoked_at IS NULL
      AND (channel_id IS NULL OR channel_id = ${input.channelId})
      AND (agent_profile_id IS NULL OR agent_profile_id = ${input.coworkerId})
  `;
  const grantedNames = new Set(registryGrants.map((row) => row.function_name));
  const limitsByFunction = new Map(
    registryGrants.map((row) => [row.function_name, readLimits(row.limits_json)]),
  );

  const snapshot: Record<string, unknown> = {};
  const grants: BrokerDataGrantPlan["grants"] = [];
  for (const functionName of declaredFunctions) {
    if (!grantedNames.has(functionName)) {
      continue;
    }
    const slice = initialSnapshotForFunction(functionName, input.validatedProps);
    Object.assign(snapshot, slice);
    const limits = limitsByFunction.get(functionName) ?? {
      maxRows: DEFAULT_MAX_ROWS,
      maxBytes: DEFAULT_MAX_BYTES,
    };
    grants.push({
      functionName,
      dataRef: functionName,
      allowedFieldPaths:
        functionName === "rows" ? rowsAllowedFieldPaths(input.validatedProps) : [[functionName]],
      maxRows: limits.maxRows,
      maxBytes: limits.maxBytes,
    });
  }

  if (grants.length === 0) {
    return { snapshot: null, grants: [] };
  }
  return { snapshot, grants };
}

export async function insertBrokerDataGrants(
  sql: SqlClient,
  input: {
    uiInstanceId: string;
    workspaceId: string;
    channelId: string;
    renderRevision: number;
    renderManifestHash: string;
    grantScopeHash: string;
    snapshot: Record<string, unknown>;
    grants: BrokerDataGrantPlan["grants"];
    now: string;
  },
): Promise<string[]> {
  const grantExpiresAtValue = grantExpiresAt(input.now);
  const immutableSnapshotHash = hashText(canonicalizeJson(input.snapshot));
  const insertedIds: string[] = [];

  for (const grant of input.grants) {
    const snapshotSchemaHash = hashText(
      canonicalizeJson({ [grant.dataRef]: grant.allowedFieldPaths }),
    );
    const dataGrantId = opaqueId("dg");
    const dataGrantBody = {
      schemaVersion: 1,
      id: dataGrantId,
      workspace_id: input.workspaceId,
      channel_id: input.channelId,
      surface_id: input.uiInstanceId,
      policy_revision: 1,
      issued_by: "application_policy",
      expires_at: grantExpiresAtValue,
      revoked_at: null,
      grant_scope_hash: input.grantScopeHash,
      created_at: input.now,
      kind: "data",
      bound_render_revision: input.renderRevision,
      bound_manifest_hash: input.renderManifestHash,
      data_ref: grant.dataRef,
      source: {
        kind: "query_snapshot",
        query_key: `component.${grant.functionName}`,
        snapshot_id: opaqueId("snap"),
      },
      classification: "synthetic",
      classification_provenance: "component_tool_broker",
      snapshot_schema_hash: snapshotSchemaHash,
      allowed_field_paths: grant.allowedFieldPaths,
      max_rows: grant.maxRows,
      max_bytes: grant.maxBytes,
      redaction_policy_key: "workspace-safe-v1",
      retained_snapshot_blob_key: `snapshots/${dataGrantId}`,
      immutable_snapshot_hash: immutableSnapshotHash,
    };

    await sql`
      INSERT INTO ui_surface_grants (
        id, ui_instance_id, grant_kind, policy_revision, bound_render_revision, bound_manifest_hash,
        data_ref, allowed_field_paths_json, max_rows, max_bytes, snapshot_schema_hash,
        immutable_snapshot_hash, grant_body_redacted_json, grant_scope_hash, issued_by, expires_at,
        created_at
      )
      VALUES (
        ${dataGrantId}, ${input.uiInstanceId}, 'data', 1, ${input.renderRevision},
        ${input.renderManifestHash}, ${grant.dataRef}, ${JSON.stringify(grant.allowedFieldPaths)}::jsonb,
        ${grant.maxRows}, ${grant.maxBytes}, ${snapshotSchemaHash}, ${immutableSnapshotHash},
        ${JSON.stringify(dataGrantBody)}::jsonb, ${input.grantScopeHash}, 'application_policy',
        ${grantExpiresAtValue}, ${input.now}
      )
    `;
    insertedIds.push(dataGrantId);
  }

  return insertedIds;
}
