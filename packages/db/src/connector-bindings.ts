import { createHash } from "node:crypto";
import type { createSql } from "./client";

type SqlClient = ReturnType<typeof createSql>;

export type ConnectorBindingRow = {
  id: string;
  workspaceId: string;
  provider: string;
  credentialOwnerType: string;
  credentialOwnerId: string;
  composioUserId: string | null;
  trueforgeConnectorName: string;
  configVersion: number;
  configHash: string;
  allowedToolsJson: unknown;
  actingIdentityJson: unknown;
  status: string;
  verifiedAt: string | null;
};

function sha256Json(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

export type EnsureP0ConnectorBindingInput = {
  connectionId: string;
  workspaceId: string;
  composioUserId: string;
  trueforgeConnectorName: string;
  allowedTools: readonly string[];
  actingIdentity: Record<string, unknown>;
  status: string;
  verifiedAt?: string | null;
};

/** Idempotently upsert the single P0 Composio connector binding (CN-001). */
export async function ensureP0ConnectorBinding(
  sql: SqlClient,
  input: EnsureP0ConnectorBindingInput,
): Promise<ConnectorBindingRow> {
  const configHash = sha256Json({
    connector: input.trueforgeConnectorName,
    tools: [...input.allowedTools].sort(),
    composioUserId: input.composioUserId,
  });
  const allowedToolsJson = JSON.stringify([...input.allowedTools]);
  const actingIdentityJson = JSON.stringify(input.actingIdentity);
  const verifiedAt = input.verifiedAt ?? null;
  const now = new Date().toISOString();

  await sql`
    INSERT INTO connector_bindings (
      id, workspace_id, provider, credential_owner_type, credential_owner_id,
      composio_user_id, trueforge_connector_name, config_version, config_hash,
      allowed_tools_json, acting_identity_json, status, verified_at, created_at, updated_at
    )
    VALUES (
      ${input.connectionId},
      ${input.workspaceId},
      'composio',
      'workspace',
      ${input.workspaceId},
      ${input.composioUserId},
      ${input.trueforgeConnectorName},
      1,
      ${configHash},
      ${allowedToolsJson}::jsonb,
      ${actingIdentityJson}::jsonb,
      ${input.status},
      ${verifiedAt},
      ${now},
      ${now}
    )
    ON CONFLICT (id) DO UPDATE SET
      composio_user_id = EXCLUDED.composio_user_id,
      config_hash = EXCLUDED.config_hash,
      allowed_tools_json = EXCLUDED.allowed_tools_json,
      acting_identity_json = EXCLUDED.acting_identity_json,
      status = EXCLUDED.status,
      verified_at = EXCLUDED.verified_at,
      updated_at = EXCLUDED.updated_at
  `;

  const loaded = await loadConnectorBinding(sql, {
    connectionId: input.connectionId,
    workspaceId: input.workspaceId,
  });
  if (!loaded.ok) {
    throw new Error("Failed to load connector binding after upsert");
  }
  return loaded.row;
}

export async function loadConnectorBinding(
  sql: SqlClient,
  input: { connectionId: string; workspaceId: string },
): Promise<
  | { ok: true; row: ConnectorBindingRow }
  | { ok: false; reason: "not_found" | "forbidden" }
> {
  const rows = await sql`
    SELECT
      id,
      workspace_id,
      provider,
      credential_owner_type,
      credential_owner_id,
      composio_user_id,
      trueforge_connector_name,
      config_version,
      config_hash,
      allowed_tools_json,
      acting_identity_json,
      status,
      verified_at
    FROM connector_bindings
    WHERE id = ${input.connectionId}
    LIMIT 1
  `;
  const row = rows[0] as
    | {
        id: string;
        workspace_id: string;
        provider: string;
        credential_owner_type: string;
        credential_owner_id: string;
        composio_user_id: string | null;
        trueforge_connector_name: string;
        config_version: number;
        config_hash: string;
        allowed_tools_json: unknown;
        acting_identity_json: unknown;
        status: string;
        verified_at: string | Date | null;
      }
    | undefined;
  if (!row) {
    return { ok: false, reason: "not_found" };
  }
  if (row.workspace_id !== input.workspaceId) {
    return { ok: false, reason: "forbidden" };
  }
  return {
    ok: true,
    row: {
      id: row.id,
      workspaceId: row.workspace_id,
      provider: row.provider,
      credentialOwnerType: row.credential_owner_type,
      credentialOwnerId: row.credential_owner_id,
      composioUserId: row.composio_user_id,
      trueforgeConnectorName: row.trueforge_connector_name,
      configVersion: row.config_version,
      configHash: row.config_hash,
      allowedToolsJson: row.allowed_tools_json,
      actingIdentityJson: row.acting_identity_json,
      status: row.status,
      verifiedAt:
        row.verified_at == null
          ? null
          : typeof row.verified_at === "string"
            ? row.verified_at
            : row.verified_at.toISOString(),
    },
  };
}

export async function listWorkspaceConnectorBindings(
  sql: SqlClient,
  workspaceId: string,
): Promise<ConnectorBindingRow[]> {
  const rows = await sql`
    SELECT
      id,
      workspace_id,
      provider,
      credential_owner_type,
      credential_owner_id,
      composio_user_id,
      trueforge_connector_name,
      config_version,
      config_hash,
      allowed_tools_json,
      acting_identity_json,
      status,
      verified_at
    FROM connector_bindings
    WHERE workspace_id = ${workspaceId}
    ORDER BY id ASC
  `;
  return (rows as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    provider: String(row.provider),
    credentialOwnerType: String(row.credential_owner_type),
    credentialOwnerId: String(row.credential_owner_id),
    composioUserId: row.composio_user_id == null ? null : String(row.composio_user_id),
    trueforgeConnectorName: String(row.trueforge_connector_name),
    configVersion: Number(row.config_version),
    configHash: String(row.config_hash),
    allowedToolsJson: row.allowed_tools_json,
    actingIdentityJson: row.acting_identity_json,
    status: String(row.status),
    verifiedAt:
      row.verified_at == null
        ? null
        : typeof row.verified_at === "string"
          ? row.verified_at
          : (row.verified_at as Date).toISOString(),
  }));
}

export async function updateConnectorBindingStatus(
  sql: SqlClient,
  input: {
    connectionId: string;
    workspaceId: string;
    status: string;
    verifiedAt?: string | null;
    actingIdentity?: Record<string, unknown>;
  },
): Promise<void> {
  const verifiedAt = input.verifiedAt ?? null;
  const now = new Date().toISOString();
  if (input.actingIdentity) {
    const actingIdentityJson = JSON.stringify(input.actingIdentity);
    await sql`
      UPDATE connector_bindings
      SET
        status = ${input.status},
        verified_at = ${verifiedAt},
        acting_identity_json = ${actingIdentityJson}::jsonb,
        updated_at = ${now}
      WHERE id = ${input.connectionId}
        AND workspace_id = ${input.workspaceId}
    `;
    return;
  }
  await sql`
    UPDATE connector_bindings
    SET
      status = ${input.status},
      verified_at = ${verifiedAt},
      updated_at = ${now}
    WHERE id = ${input.connectionId}
      AND workspace_id = ${input.workspaceId}
  `;
}
