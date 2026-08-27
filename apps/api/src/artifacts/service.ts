import {
  artifactPreviewSchema,
  artifactSchema,
  type Artifact,
  type ArtifactPreview,
  type ErrorCode,
  type SessionResponse,
} from "@forgeroom/contracts";
import {
  loadArtifactById,
  publishArtifactRecord,
  type ArtifactRecord,
  type createSql,
} from "@forgeroom/db";
import {
  buildArtifactPreview,
  createSharpImageProcessor,
  loadArtifactStorageFromEnv,
  previewSecurityHeaders,
  readArtifactContent,
  storeArtifactContent,
  toSafeArtifactFilename,
  type ArtifactStorageAdapter,
} from "@forgeroom/artifacts";
import { randomOpaqueId } from "../auth/crypto";
import type { ApiEnv } from "../env";
import type { WorkspaceService } from "../workspace/service";

type SqlClient = ReturnType<typeof createSql>;

export type ArtifactServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: ErrorCode; message: string } };

export type PublishArtifactInput = {
  id?: string;
  workspaceId: string;
  channelId: string;
  runId: string;
  runStepId: string;
  creatorAgentId: string;
  kind: "file" | "preview";
  name: string;
  mimeType: string;
  revision: number;
  content: Buffer;
  sourceSandboxId?: string | null;
  sourceSandboxPath?: string | null;
  metadataJson?: Record<string, unknown>;
  createdAt?: string;
};

function toArtifactView(record: ArtifactRecord): Artifact {
  return artifactSchema.parse({
    schemaVersion: 1,
    id: record.id,
    workspace_id: record.workspaceId,
    channel_id: record.channelId,
    run_id: record.runId,
    run_step_id: record.runStepId,
    creator_coworker_id: record.creatorAgentId,
    kind: record.kind,
    name: record.name,
    mime_type: record.mimeType,
    byte_size: record.byteSize,
    sha256: record.sha256,
    revision: record.revision,
    created_at: record.createdAt,
  });
}

export type ArtifactService = {
  getArtifact(
    session: SessionResponse,
    artifactId: string,
  ): Promise<ArtifactServiceResult<{ artifact: Artifact }>>;
  downloadArtifact(
    session: SessionResponse,
    artifactId: string,
  ): Promise<
    ArtifactServiceResult<{
      filename: string;
      mimeType: string;
      content: Buffer;
    }>
  >;
  previewArtifact(
    session: SessionResponse,
    artifactId: string,
  ): Promise<
    ArtifactServiceResult<{
      preview: ArtifactPreview;
      headers: Record<string, string>;
      imageBody?: Buffer;
    }>
  >;
  publishArtifact(
    input: PublishArtifactInput,
  ): Promise<
    ArtifactServiceResult<{ artifact: Artifact; created: boolean; storageKey: string }>
  >;
};

export function createArtifactService(options: {
  env: ApiEnv;
  workspace: WorkspaceService;
  storage: ArtifactStorageAdapter;
  sql?: SqlClient;
}): ArtifactService {
  const { workspace, storage, sql } = options;

  async function authorizeArtifact(
    session: SessionResponse,
    artifactId: string,
  ): Promise<
    | { ok: true; record: ArtifactRecord }
    | { ok: false; error: { code: ErrorCode; message: string } }
  > {
    if (!sql) {
      return { ok: false, error: { code: "not_found", message: "Artifact not found." } };
    }
    const record = await loadArtifactById(sql, artifactId);
    if (!record) {
      return { ok: false, error: { code: "not_found", message: "Artifact not found." } };
    }
    const channel = await workspace.getChannel(session, record.channelId);
    if (!channel.ok) {
      return {
        ok: false,
        error: {
          code: channel.error.code,
          message: channel.error.message,
        },
      };
    }
    if (channel.value.workspace_id !== record.workspaceId) {
      return { ok: false, error: { code: "forbidden", message: "Artifact access denied." } };
    }
    return { ok: true, record };
  }

  return {
    async getArtifact(session, artifactId) {
      const authorized = await authorizeArtifact(session, artifactId);
      if (!authorized.ok) {
        return authorized;
      }
      return { ok: true, value: { artifact: toArtifactView(authorized.record) } };
    },

    async downloadArtifact(session, artifactId) {
      const authorized = await authorizeArtifact(session, artifactId);
      if (!authorized.ok) {
        return authorized;
      }
      const content = await readArtifactContent(storage, {
        storageKey: authorized.record.storageKey,
        workspaceId: authorized.record.workspaceId,
        channelId: authorized.record.channelId,
      });
      if (!content) {
        return {
          ok: false,
          error: { code: "not_found", message: "Artifact content is unavailable." },
        };
      }
      return {
        ok: true,
        value: {
          filename: toSafeArtifactFilename(authorized.record.name),
          mimeType: authorized.record.mimeType,
          content,
        },
      };
    },

    async previewArtifact(session, artifactId) {
      const authorized = await authorizeArtifact(session, artifactId);
      if (!authorized.ok) {
        return authorized;
      }
      const content = await readArtifactContent(storage, {
        storageKey: authorized.record.storageKey,
        workspaceId: authorized.record.workspaceId,
        channelId: authorized.record.channelId,
      });
      if (!content) {
        return {
          ok: false,
          error: { code: "not_found", message: "Artifact content is unavailable." },
        };
      }

      const altText =
        typeof authorized.record.metadataJson.alt_text === "string"
          ? authorized.record.metadataJson.alt_text
          : null;
      const built = await buildArtifactPreview({
        mimeType: authorized.record.mimeType,
        content,
        altText,
        imageProcessor: createSharpImageProcessor(),
      });

      const headers = previewSecurityHeaders();
      if (built.kind === "text") {
        return {
          ok: true,
          value: {
            headers,
            preview: artifactPreviewSchema.parse({
              kind: "text",
              mime_type: built.mimeType,
              content: built.content,
              truncated: built.truncated,
            }),
          },
        };
      }
      if (built.kind === "image") {
        return {
          ok: true,
          value: {
            headers: {
              ...headers,
              "Content-Type": built.mimeType,
            },
            preview: artifactPreviewSchema.parse({
              kind: "image",
              mime_type: built.mimeType,
              width: built.width,
              height: built.height,
              alt_text_status: built.altTextStatus,
              byte_size: built.content.byteLength,
            }),
            imageBody: built.content,
          },
        };
      }
      return {
        ok: true,
        value: {
          headers,
          preview: artifactPreviewSchema.parse({
            kind: "unsupported",
            reason: built.reason,
          }),
        },
      };
    },

    async publishArtifact(input) {
      if (!sql) {
        return {
          ok: false,
          error: { code: "provider_unavailable", message: "Artifact persistence is unavailable." },
        };
      }
      const createdAt = input.createdAt ?? new Date().toISOString();
      const stored = await storeArtifactContent(storage, {
        workspaceId: input.workspaceId,
        channelId: input.channelId,
        revision: input.revision,
        content: input.content,
      });
      const recordResult = await publishArtifactRecord(sql, {
        id: input.id ?? randomOpaqueId("artifact"),
        workspaceId: input.workspaceId,
        channelId: input.channelId,
        runId: input.runId,
        runStepId: input.runStepId,
        creatorAgentId: input.creatorAgentId,
        kind: input.kind,
        name: input.name,
        mimeType: input.mimeType,
        storageKey: stored.storageKey,
        byteSize: stored.byteSize,
        sha256: stored.sha256,
        sourceSandboxId: input.sourceSandboxId ?? null,
        sourceSandboxPath: input.sourceSandboxPath ?? null,
        revision: input.revision,
        metadataJson: input.metadataJson,
        createdAt,
      });
      if (!recordResult.ok) {
        return {
          ok: false,
          error: {
            code: "conflict",
            message: "Identical artifact revision already exists with different metadata.",
          },
        };
      }
      return {
        ok: true,
        value: {
          artifact: toArtifactView(recordResult.artifact),
          created: recordResult.created,
          storageKey: stored.storageKey,
        },
      };
    },
  };
}

export function createArtifactServiceFromEnv(options: {
  env: ApiEnv;
  workspace: WorkspaceService;
  sql?: SqlClient;
  storage?: ArtifactStorageAdapter;
}): ArtifactService {
  return createArtifactService({
    env: options.env,
    workspace: options.workspace,
    storage: options.storage ?? loadArtifactStorageFromEnv(process.env),
    ...(options.sql ? { sql: options.sql } : {}),
  });
}
