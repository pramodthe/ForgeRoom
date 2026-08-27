import { createHash, randomBytes } from "node:crypto";
import type postgres from "postgres";

export type SqlClient = postgres.Sql;
type RegistrySql = postgres.Sql | postgres.TransactionSql;

export type ComponentRegistryDefinition = {
  stableName: string;
  kind: string;
  semanticVersion: string;
  exposure: "agent_tool" | "server_only";
  confirmationPolicy: "none" | "trusted_host";
  modelDescription: string;
  argumentSchema: Record<string, unknown>;
  rendererKey: string;
  previewProps?: Record<string, unknown>;
  declaredDataFunctions?: unknown[];
  declaredInteractionIntents?: unknown[];
  descriptorHash: string;
};

export type PublishedComponentVersion = {
  id: string;
  stableName: string;
  semanticVersion: string;
  descriptorHash: string;
  exposure: "agent_tool" | "server_only";
};

export type SetComponentGrantInput = {
  id?: string;
  componentVersionId: string;
  workspaceId: string;
  channelId: string | null;
  agentProfileId: string | null;
  grantedBy: string;
  granted?: boolean;
};

export type SetComponentGrantResult = {
  grantId: string;
  changed: boolean;
  action: "granted" | "revoked" | "noop";
};

export type HasActiveComponentGrantInput = {
  componentVersionId: string;
  workspaceId: string;
  channelId?: string | null;
  agentProfileId?: string | null;
};

export type AppendComponentAuditEventInput = {
  workspaceId: string;
  channelId?: string | null;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  payload?: Record<string, unknown>;
};

export type ApplyComponentGrantChangeInput = {
  grantInput: SetComponentGrantInput;
  audit: AppendComponentAuditEventInput;
  sessionAgentProfileId: string | null;
};

export type ApplyComponentGrantChangeResult = {
  grant: SetComponentGrantResult;
  sessionRotations: string[];
  auditId: string | null;
};

function opaqueId(prefix: string): string {
  return `${prefix}_${randomBytes(10).toString("hex")}`;
}

function sha256Payload(payload: Record<string, unknown>): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

type VersionRow = {
  id: string;
  descriptor_hash: string;
  revoked_at: string | null;
};

function assertExistingVersion(row: VersionRow, definition: ComponentRegistryDefinition): string {
  if (row.revoked_at) {
    throw new Error(
      `cannot republish revoked version ${definition.stableName}@${definition.semanticVersion}`,
    );
  }
  if (row.descriptor_hash !== definition.descriptorHash) {
    throw new Error(
      `descriptor_hash mismatch for ${definition.stableName}@${definition.semanticVersion}`,
    );
  }
  return row.id;
}

/**
 * Effective grant intersection: an active row matches when workspace_id equals the
 * requested workspace and each nullable scope column is either NULL (workspace-wide)
 * or equal to the requested channel/agent value.
 */
export async function hasActiveComponentGrant(
  sql: RegistrySql,
  input: HasActiveComponentGrantInput,
): Promise<boolean> {
  const channelId = input.channelId ?? null;
  const agentProfileId = input.agentProfileId ?? null;
  const rows = await sql<{ id: string }[]>`
    SELECT id
    FROM ui_component_grants
    WHERE component_version_id = ${input.componentVersionId}
      AND workspace_id = ${input.workspaceId}
      AND revoked_at IS NULL
      AND (channel_id IS NULL OR channel_id = ${channelId})
      AND (agent_profile_id IS NULL OR agent_profile_id = ${agentProfileId})
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function publishWorkspaceRegistry(
  sql: SqlClient,
  input: {
    workspaceId: string;
    publishedByUserId: string;
    definitions: ComponentRegistryDefinition[];
    now?: string;
  },
): Promise<PublishedComponentVersion[]> {
  return sql.begin(async (tx) => {
    const now = input.now ?? new Date().toISOString();
    const published: PublishedComponentVersion[] = [];

    for (const definition of input.definitions) {
      const [existingComponent] = await tx<{ id: string }[]>`
        SELECT id
        FROM ui_components
        WHERE workspace_id = ${input.workspaceId}
          AND stable_name = ${definition.stableName}
      `;

      let componentId = existingComponent?.id;
      if (!componentId) {
        componentId = opaqueId("comp");
        try {
          await tx`
            INSERT INTO ui_components (
              id, workspace_id, stable_name, kind, status, created_by, created_at, updated_at
            )
            VALUES (
              ${componentId},
              ${input.workspaceId},
              ${definition.stableName},
              ${definition.kind},
              'active',
              ${input.publishedByUserId},
              ${now},
              ${now}
            )
          `;
        } catch (error) {
          if (!isUniqueViolation(error)) {
            throw error;
          }
          const [raced] = await tx<{ id: string }[]>`
            SELECT id
            FROM ui_components
            WHERE workspace_id = ${input.workspaceId}
              AND stable_name = ${definition.stableName}
          `;
          if (!raced) {
            throw error;
          }
          componentId = raced.id;
        }
      }

      const [existingVersion] = await tx<VersionRow[]>`
        SELECT id, descriptor_hash, revoked_at
        FROM ui_component_versions
        WHERE component_id = ${componentId}
          AND semantic_version = ${definition.semanticVersion}
      `;

      let versionId = existingVersion?.id;
      if (existingVersion) {
        versionId = assertExistingVersion(existingVersion, definition);
      } else {
        versionId = opaqueId("compv");
        try {
          await tx`
            INSERT INTO ui_component_versions (
              id,
              component_id,
              semantic_version,
              exposure,
              confirmation_policy,
              model_description,
              argument_schema_json,
              renderer_key,
              preview_props_json,
              declared_data_functions_json,
              declared_interaction_intents_json,
              descriptor_hash,
              published_by,
              published_at
            )
            VALUES (
              ${versionId},
              ${componentId},
              ${definition.semanticVersion},
              ${definition.exposure},
              ${definition.confirmationPolicy},
              ${definition.modelDescription},
              ${JSON.stringify(definition.argumentSchema)}::jsonb,
              ${definition.rendererKey},
              ${JSON.stringify(definition.previewProps ?? {})}::jsonb,
              ${JSON.stringify(definition.declaredDataFunctions ?? [])}::jsonb,
              ${JSON.stringify(definition.declaredInteractionIntents ?? [])}::jsonb,
              ${definition.descriptorHash},
              ${input.publishedByUserId},
              ${now}
            )
          `;
        } catch (error) {
          if (!isUniqueViolation(error)) {
            throw error;
          }
          const [raced] = await tx<VersionRow[]>`
            SELECT id, descriptor_hash, revoked_at
            FROM ui_component_versions
            WHERE component_id = ${componentId}
              AND semantic_version = ${definition.semanticVersion}
          `;
          if (!raced) {
            throw error;
          }
          versionId = assertExistingVersion(raced, definition);
        }
      }

      if (!versionId) {
        throw new Error(
          `failed to resolve version for ${definition.stableName}@${definition.semanticVersion}`,
        );
      }

      await tx`
        UPDATE ui_components
        SET current_published_version_id = ${versionId},
            updated_at = ${now}
        WHERE id = ${componentId}
      `;

      published.push({
        id: versionId,
        stableName: definition.stableName,
        semanticVersion: definition.semanticVersion,
        descriptorHash: definition.descriptorHash,
        exposure: definition.exposure,
      });
    }

    return published;
  });
}

export async function setComponentGrant(
  sql: RegistrySql,
  input: SetComponentGrantInput,
): Promise<SetComponentGrantResult> {
  const granted = input.granted ?? true;
  const [version] = await sql<
    {
      exposure: "agent_tool" | "server_only";
      revoked_at: string | null;
      workspace_id: string;
    }[]
  >`
    SELECT v.exposure, v.revoked_at, c.workspace_id
    FROM ui_component_versions v
    JOIN ui_components c ON c.id = v.component_id
    WHERE v.id = ${input.componentVersionId}
  `;
  if (!version) {
    throw new Error(`unknown component version ${input.componentVersionId}`);
  }
  if (version.workspace_id !== input.workspaceId) {
    throw new Error(
      `component version ${input.componentVersionId} does not belong to workspace ${input.workspaceId}`,
    );
  }
  if (version.revoked_at) {
    throw new Error(`cannot grant revoked component version ${input.componentVersionId}`);
  }
  if (version.exposure === "server_only") {
    throw new Error("cannot grant server_only component versions");
  }

  if (input.channelId) {
    const [channel] = await sql<{ id: string }[]>`
      SELECT id
      FROM channels
      WHERE id = ${input.channelId}
        AND workspace_id = ${input.workspaceId}
    `;
    if (!channel) {
      throw new Error(
        `channel ${input.channelId} does not belong to workspace ${input.workspaceId}`,
      );
    }
  }

  if (input.agentProfileId) {
    const [agent] = await sql<{ id: string }[]>`
      SELECT id
      FROM agent_profiles
      WHERE id = ${input.agentProfileId}
        AND workspace_id = ${input.workspaceId}
    `;
    if (!agent) {
      throw new Error(
        `agent profile ${input.agentProfileId} does not belong to workspace ${input.workspaceId}`,
      );
    }
  }

  if (!granted) {
    const revoked = await sql<{ id: string }[]>`
      UPDATE ui_component_grants
      SET revoked_at = now()
      WHERE component_version_id = ${input.componentVersionId}
        AND workspace_id = ${input.workspaceId}
        AND channel_id IS NOT DISTINCT FROM ${input.channelId}
        AND agent_profile_id IS NOT DISTINCT FROM ${input.agentProfileId}
        AND revoked_at IS NULL
      RETURNING id
    `;
    if (revoked.length === 0) {
      return { grantId: input.id ?? opaqueId("ucg"), changed: false, action: "noop" };
    }
    return { grantId: revoked[0]!.id, changed: true, action: "revoked" };
  }

  const [active] = await sql<{ id: string }[]>`
    SELECT id
    FROM ui_component_grants
    WHERE component_version_id = ${input.componentVersionId}
      AND workspace_id = ${input.workspaceId}
      AND channel_id IS NOT DISTINCT FROM ${input.channelId}
      AND agent_profile_id IS NOT DISTINCT FROM ${input.agentProfileId}
      AND revoked_at IS NULL
  `;
  if (active) {
    return { grantId: active.id, changed: false, action: "noop" };
  }

  const grantId = input.id ?? opaqueId("ucg");
  try {
    await sql`
      INSERT INTO ui_component_grants (
        id,
        component_version_id,
        workspace_id,
        channel_id,
        agent_profile_id,
        granted_by,
        granted_at
      )
      VALUES (
        ${grantId},
        ${input.componentVersionId},
        ${input.workspaceId},
        ${input.channelId},
        ${input.agentProfileId},
        ${input.grantedBy},
        now()
      )
    `;
    return { grantId, changed: true, action: "granted" };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const [existing] = await sql<{ id: string }[]>`
        SELECT id
        FROM ui_component_grants
        WHERE component_version_id = ${input.componentVersionId}
          AND workspace_id = ${input.workspaceId}
          AND channel_id IS NOT DISTINCT FROM ${input.channelId}
          AND agent_profile_id IS NOT DISTINCT FROM ${input.agentProfileId}
          AND revoked_at IS NULL
      `;
      if (existing) {
        return { grantId: existing.id, changed: false, action: "noop" };
      }
    }
    throw error;
  }
}

export async function listPublishedComponentVersions(
  sql: RegistrySql,
  workspaceId: string,
): Promise<PublishedComponentVersion[]> {
  const rows = await sql<
    {
      id: string;
      stable_name: string;
      semantic_version: string;
      descriptor_hash: string;
      exposure: "agent_tool" | "server_only";
    }[]
  >`
    SELECT
      v.id,
      c.stable_name,
      v.semantic_version,
      v.descriptor_hash,
      v.exposure
    FROM ui_components c
    JOIN ui_component_versions v ON v.id = c.current_published_version_id
    WHERE c.workspace_id = ${workspaceId}
      AND v.revoked_at IS NULL
    ORDER BY c.stable_name ASC, v.semantic_version ASC
  `;
  return rows.map((row) => ({
    id: row.id,
    stableName: row.stable_name,
    semanticVersion: row.semantic_version,
    descriptorHash: row.descriptor_hash,
    exposure: row.exposure,
  }));
}

export async function appendComponentAuditEvent(
  sql: RegistrySql,
  input: AppendComponentAuditEventInput,
): Promise<{ id: string; payloadHash: string }> {
  const payload = input.payload ?? {};
  const payloadHash = sha256Payload(payload);
  const id = opaqueId("audit");
  const payloadJson = JSON.stringify(payload);
  await sql.unsafe(
    `INSERT INTO audit_events (
      id, workspace_id, channel_id, actor_type, actor_id, action, target_type, target_id,
      redacted_payload_json, payload_hash
    ) VALUES ($1, $2, $3, 'human', $4, $5, $6, $7, $8::jsonb, $9)`,
    [
      id,
      input.workspaceId,
      input.channelId ?? null,
      input.actorUserId,
      input.action,
      input.targetType,
      input.targetId,
      payloadJson,
      payloadHash,
    ],
  );
  return { id, payloadHash };
}

export async function applyComponentGrantChange(
  sql: SqlClient,
  input: ApplyComponentGrantChangeInput,
): Promise<ApplyComponentGrantChangeResult> {
  return sql.begin(async (tx) => {
    const grant = await setComponentGrant(tx, input.grantInput);

    let sessionRotations: string[] = [];
    if (grant.changed && input.sessionAgentProfileId) {
      const sessions = await tx<{ id: string }[]>`
        SELECT id
        FROM channel_agent_sessions
        WHERE agent_profile_id = ${input.sessionAgentProfileId}
          AND workspace_id = ${input.grantInput.workspaceId}
          AND state <> 'retired'
      `;
      sessionRotations = sessions.map((row) => row.id);
    }

    let auditId: string | null = null;
    if (grant.changed) {
      const auditResult = await appendComponentAuditEvent(tx, {
        ...input.audit,
        targetId: grant.grantId,
        payload: {
          ...input.audit.payload,
          grant_id: grant.grantId,
          action: grant.action,
          session_rotations: sessionRotations,
        },
      });
      auditId = auditResult.id;
    }

    return { grant, sessionRotations, auditId };
  });
}
