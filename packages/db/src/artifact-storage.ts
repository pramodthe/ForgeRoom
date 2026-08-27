import type { createSql } from "./client";

type SqlClient = ReturnType<typeof createSql>;

export type ArtifactRecord = {
  id: string;
  workspaceId: string;
  channelId: string;
  runId: string;
  runStepId: string;
  creatorAgentId: string;
  kind: "file" | "preview";
  name: string;
  mimeType: string;
  storageKey: string;
  byteSize: number;
  sha256: string;
  sourceSandboxId: string | null;
  sourceSandboxPath: string | null;
  revision: number;
  metadataJson: Record<string, unknown>;
  createdAt: string;
};

export type PublishArtifactRecordInput = {
  id: string;
  workspaceId: string;
  channelId: string;
  runId: string;
  runStepId: string;
  creatorAgentId: string;
  kind: "file" | "preview";
  name: string;
  mimeType: string;
  storageKey: string;
  byteSize: number;
  sha256: string;
  sourceSandboxId?: string | null;
  sourceSandboxPath?: string | null;
  revision: number;
  metadataJson?: Record<string, unknown>;
  createdAt: string;
};

export type PublishArtifactRecordResult =
  | { ok: true; artifact: ArtifactRecord; created: boolean }
  | {
      ok: false;
      reason: "content_revision_conflict" | "storage_key_conflict";
      existing?: ArtifactRecord;
    };

type ArtifactRow = {
  id: string;
  workspace_id: string;
  channel_id: string;
  run_id: string;
  run_step_id: string;
  creator_agent_id: string;
  kind: string;
  name: string;
  mime_type: string;
  storage_key: string;
  byte_size: number;
  sha256: string;
  source_sandbox_id: string | null;
  source_sandbox_path: string | null;
  revision: number;
  metadata_json: unknown;
  created_at: Date | string;
};

function asIso(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }
  return new Date(parsed).toISOString();
}

function mapArtifactRow(row: ArtifactRow): ArtifactRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    channelId: row.channel_id,
    runId: row.run_id,
    runStepId: row.run_step_id,
    creatorAgentId: row.creator_agent_id,
    kind: row.kind as ArtifactRecord["kind"],
    name: row.name,
    mimeType: row.mime_type,
    storageKey: row.storage_key,
    byteSize: row.byte_size,
    sha256: row.sha256,
    sourceSandboxId: row.source_sandbox_id,
    sourceSandboxPath: row.source_sandbox_path,
    revision: row.revision,
    metadataJson:
      row.metadata_json && typeof row.metadata_json === "object"
        ? (row.metadata_json as Record<string, unknown>)
        : {},
    createdAt: asIso(row.created_at),
  };
}

export async function loadArtifactById(
  sql: SqlClient,
  artifactId: string,
): Promise<ArtifactRecord | null> {
  const rows = await sql<ArtifactRow[]>`
    SELECT
      id, workspace_id, channel_id, run_id, run_step_id, creator_agent_id,
      kind, name, mime_type, storage_key, byte_size, sha256,
      source_sandbox_id, source_sandbox_path, revision, metadata_json, created_at
    FROM artifacts
    WHERE id = ${artifactId}
    LIMIT 1
  `;
  return rows[0] ? mapArtifactRow(rows[0]) : null;
}

export async function findArtifactByContentRevision(
  sql: SqlClient,
  input: {
    workspaceId: string;
    channelId: string;
    sha256: string;
    revision: number;
  },
): Promise<ArtifactRecord | null> {
  const rows = await sql<ArtifactRow[]>`
    SELECT
      id, workspace_id, channel_id, run_id, run_step_id, creator_agent_id,
      kind, name, mime_type, storage_key, byte_size, sha256,
      source_sandbox_id, source_sandbox_path, revision, metadata_json, created_at
    FROM artifacts
    WHERE workspace_id = ${input.workspaceId}
      AND channel_id = ${input.channelId}
      AND sha256 = ${input.sha256}
      AND revision = ${input.revision}
    LIMIT 1
  `;
  return rows[0] ? mapArtifactRow(rows[0]) : null;
}

export async function publishArtifactRecord(
  sql: SqlClient,
  input: PublishArtifactRecordInput,
): Promise<PublishArtifactRecordResult> {
  const byContent = await findArtifactByContentRevision(sql, {
    workspaceId: input.workspaceId,
    channelId: input.channelId,
    sha256: input.sha256,
    revision: input.revision,
  });
  if (byContent) {
    if (
      byContent.storageKey !== input.storageKey ||
      byContent.byteSize !== input.byteSize ||
      byContent.workspaceId !== input.workspaceId ||
      byContent.channelId !== input.channelId
    ) {
      return { ok: false, reason: "content_revision_conflict", existing: byContent };
    }
    return { ok: true, artifact: byContent, created: false };
  }

  const metadataJson = JSON.stringify(input.metadataJson ?? {});
  try {
    await sql`
      INSERT INTO artifacts (
        id, workspace_id, channel_id, run_id, run_step_id, creator_agent_id,
        kind, name, mime_type, storage_key, byte_size, sha256,
        source_sandbox_id, source_sandbox_path, revision, metadata_json, created_at
      )
      VALUES (
        ${input.id},
        ${input.workspaceId},
        ${input.channelId},
        ${input.runId},
        ${input.runStepId},
        ${input.creatorAgentId},
        ${input.kind},
        ${input.name},
        ${input.mimeType},
        ${input.storageKey},
        ${input.byteSize},
        ${input.sha256},
        ${input.sourceSandboxId ?? null},
        ${input.sourceSandboxPath ?? null},
        ${input.revision},
        ${metadataJson}::jsonb,
        ${input.createdAt}
      )
    `;
  } catch (error) {
    const err = error as { code?: string };
    if (err.code === "23505") {
      const existing =
        (await findArtifactByContentRevision(sql, {
          workspaceId: input.workspaceId,
          channelId: input.channelId,
          sha256: input.sha256,
          revision: input.revision,
        })) ?? (await loadArtifactById(sql, input.id));
      if (existing) {
        if (
          existing.storageKey !== input.storageKey ||
          existing.byteSize !== input.byteSize ||
          existing.workspaceId !== input.workspaceId ||
          existing.channelId !== input.channelId ||
          existing.sha256 !== input.sha256 ||
          existing.revision !== input.revision
        ) {
          return { ok: false, reason: "content_revision_conflict", existing };
        }
        return { ok: true, artifact: existing, created: false };
      }
      return { ok: false, reason: "storage_key_conflict" };
    }
    throw error;
  }

  const created = await loadArtifactById(sql, input.id);
  if (!created) {
    throw new Error("artifact insert succeeded but row is missing");
  }
  return { ok: true, artifact: created, created: true };
}
