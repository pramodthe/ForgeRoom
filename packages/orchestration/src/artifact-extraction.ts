import type { InternalWorkerCommand } from "@forgeroom/contracts";
import {
  validateDiscoveredArtifactDownload,
  validateDiscoveredArtifactMetadata,
  type DiscoveredSandboxArtifact,
} from "@forgeroom/artifacts";
import type { TrueForgeClient } from "@forgeroom/trueforge";

export type ProjectedArtifactRunEvent = {
  normalizedType: "artifact.discovered" | "artifact.published" | "artifact.preview_failed";
  payloadRedacted: Record<string, unknown>;
};

export type ProjectedArtifactActivity = {
  activityType: "forgeroom.artifact.v1";
  messageId: string;
  artifactId: string;
  revision: number;
  mimeType: string;
  title: string;
  replace: true;
};

export type PublishSandboxArtifactCommand = Extract<
  InternalWorkerCommand,
  { name: "publish_sandbox_artifact" }
>;

export type SandboxArtifactPublishInput = {
  workspaceId: string;
  channelId: string;
  runId: string;
  runStepId: string;
  creatorAgentId: string;
  trueforgeSessionId: string;
  trueforgeTurnId: string;
  artifactId: string;
  revision: number;
  discovery: DiscoveredSandboxArtifact;
  sandboxCommandState: "creating" | "running" | "completed" | "failed";
  /** When set, downloaded bytes must match before durable publish. */
  contentBinding?: { sha256: string; byteSize: number };
};

export type SandboxArtifactPublishAdapters = {
  downloadSandboxFile: (input: {
    sessionId: string;
    turnId: string;
    sandboxPath: string;
  }) => Promise<Buffer>;
  publishArtifact: (input: {
    id: string;
    workspaceId: string;
    channelId: string;
    runId: string;
    runStepId: string;
    creatorAgentId: string;
    kind: "file";
    name: string;
    mimeType: string;
    revision: number;
    content: Buffer;
    sourceSandboxId: string;
    sourceSandboxPath: string;
    metadataJson?: Record<string, unknown>;
  }) => Promise<
    | { ok: true; created: boolean; sha256: string; byteSize: number }
    | { ok: false; reason: string }
  >;
};

export type SandboxArtifactPublishResult =
  | {
      ok: true;
      kind: "published";
      artifactId: string;
      revision: number;
      sha256: string;
      byteSize: number;
      created: boolean;
      events: ProjectedArtifactRunEvent[];
      activity: ProjectedArtifactActivity;
    }
  | {
      ok: false;
      kind:
        | "sandbox_not_ready"
        | "metadata_invalid"
        | "download_failed"
        | "validation_failed"
        | "publish_failed"
        | "command_state_mismatch"
        | "revision_mismatch"
        | "hash_mismatch"
        | "size_mismatch"
        | "not_found";
      reason: string;
      events: ProjectedArtifactRunEvent[];
    };

function buildDiscoveredEvent(input: {
  artifactId: string;
  discovery: DiscoveredSandboxArtifact;
}): ProjectedArtifactRunEvent {
  return {
    normalizedType: "artifact.discovered",
    payloadRedacted: {
      type: "artifact.discovered",
      artifact_id: input.artifactId,
      sandbox_id: input.discovery.sandboxId,
      name: input.discovery.name,
      mime_type: input.discovery.mimeType,
      byte_size: input.discovery.declaredByteSize,
      source_sandbox_path: input.discovery.relativePath,
    },
  };
}

function buildPublishedEvent(input: {
  artifactId: string;
  revision: number;
  sha256: string;
  byteSize: number;
  mimeType: string;
  name: string;
}): ProjectedArtifactRunEvent {
  return {
    normalizedType: "artifact.published",
    payloadRedacted: {
      type: "artifact.published",
      artifact_id: input.artifactId,
      revision: input.revision,
      sha256: input.sha256,
      byte_size: input.byteSize,
      mime_type: input.mimeType,
      name: input.name,
    },
  };
}

function buildPreviewFailedEvent(input: {
  artifactId: string;
  reason: string;
}): ProjectedArtifactRunEvent {
  return {
    normalizedType: "artifact.preview_failed",
    payloadRedacted: {
      type: "artifact.preview_failed",
      artifact_id: input.artifactId,
      reason: input.reason,
    },
  };
}

export function projectArtifactActivitySnapshot(input: {
  artifactId: string;
  revision: number;
  mimeType: string;
  title: string;
  messageIdPrefix?: string;
}): ProjectedArtifactActivity {
  return {
    activityType: "forgeroom.artifact.v1",
    messageId: `${input.messageIdPrefix ?? "act_artifact"}_${input.artifactId.slice(-8)}`,
    artifactId: input.artifactId,
    revision: input.revision,
    mimeType: input.mimeType,
    title: input.title,
    replace: true,
  };
}

export async function publishSandboxArtifactFromDiscovery(
  adapters: SandboxArtifactPublishAdapters,
  input: SandboxArtifactPublishInput,
): Promise<SandboxArtifactPublishResult> {
  const discoveredEvent = buildDiscoveredEvent({
    artifactId: input.artifactId,
    discovery: input.discovery,
  });

  if (input.sandboxCommandState !== "completed") {
    return {
      ok: false,
      kind: "sandbox_not_ready",
      reason: `sandbox command state is ${input.sandboxCommandState}`,
      events: [discoveredEvent],
    };
  }

  const metadata = validateDiscoveredArtifactMetadata(input.discovery);
  if (!metadata.ok) {
    return {
      ok: false,
      kind: "metadata_invalid",
      reason: metadata.reason,
      events: [
        discoveredEvent,
        buildPreviewFailedEvent({ artifactId: input.artifactId, reason: metadata.reason }),
      ],
    };
  }

  let content: Buffer;
  try {
    content = await adapters.downloadSandboxFile({
      sessionId: input.trueforgeSessionId,
      turnId: input.trueforgeTurnId,
      sandboxPath: input.discovery.sandboxPath,
    });
  } catch (error) {
    return {
      ok: false,
      kind: "download_failed",
      reason: error instanceof Error ? error.message : "download failed",
      events: [discoveredEvent],
    };
  }

  const validated = validateDiscoveredArtifactDownload({
    discovery: input.discovery,
    content,
  });
  if (!validated.ok) {
    return {
      ok: false,
      kind: "validation_failed",
      reason: validated.reason,
      events: [
        discoveredEvent,
        buildPreviewFailedEvent({ artifactId: input.artifactId, reason: validated.reason }),
      ],
    };
  }

  if (input.contentBinding) {
    if (validated.value.sha256 !== input.contentBinding.sha256) {
      return {
        ok: false,
        kind: "hash_mismatch",
        reason: "downloaded content hash does not match command binding",
        events: [discoveredEvent],
      };
    }
    if (validated.value.byteSize !== input.contentBinding.byteSize) {
      return {
        ok: false,
        kind: "size_mismatch",
        reason: "downloaded byte size does not match command binding",
        events: [discoveredEvent],
      };
    }
  }

  const published = await adapters.publishArtifact({
    id: input.artifactId,
    workspaceId: input.workspaceId,
    channelId: input.channelId,
    runId: input.runId,
    runStepId: input.runStepId,
    creatorAgentId: input.creatorAgentId,
    kind: "file",
    name: input.discovery.name,
    mimeType: validated.value.mimeType,
    revision: input.revision,
    content: validated.value.content,
    sourceSandboxId: input.discovery.sandboxId,
    sourceSandboxPath: input.discovery.relativePath,
    metadataJson: {
      alt_text_status: "missing",
      preview_mime_type: validated.value.mimeType,
    },
  });
  if (!published.ok) {
    return {
      ok: false,
      kind: "publish_failed",
      reason: published.reason,
      events: [discoveredEvent],
    };
  }

  const publishedEvent = buildPublishedEvent({
    artifactId: input.artifactId,
    revision: input.revision,
    sha256: published.sha256,
    byteSize: published.byteSize,
    mimeType: validated.value.mimeType,
    name: input.discovery.name,
  });

  return {
    ok: true,
    kind: "published",
    artifactId: input.artifactId,
    revision: input.revision,
    sha256: published.sha256,
    byteSize: published.byteSize,
    created: published.created,
    events: [discoveredEvent, publishedEvent],
    activity: projectArtifactActivitySnapshot({
      artifactId: input.artifactId,
      revision: input.revision,
      mimeType: validated.value.mimeType,
      title: input.discovery.name,
    }),
  };
}

export async function executePublishSandboxArtifactCommand(
  adapters: SandboxArtifactPublishAdapters & {
    loadDiscovery: (command: PublishSandboxArtifactCommand) => Promise<SandboxArtifactPublishInput | null>;
  },
  command: PublishSandboxArtifactCommand,
): Promise<SandboxArtifactPublishResult> {
  const loaded = await adapters.loadDiscovery(command);
  if (!loaded) {
    return {
      ok: false,
      kind: "not_found",
      reason: "artifact discovery binding not found",
      events: [],
    };
  }

  if (command.payload.expected_sandbox_state !== "command_completed") {
    return {
      ok: false,
      kind: "command_state_mismatch",
      reason: "expected sandbox state must be command_completed",
      events: [],
    };
  }
  if (command.payload.next_artifact_revision !== command.payload.expected_artifact_revision + 1) {
    return {
      ok: false,
      kind: "revision_mismatch",
      reason: "next revision must follow expected revision",
      events: [],
    };
  }
  if (loaded.revision !== command.payload.next_artifact_revision) {
    return {
      ok: false,
      kind: "revision_mismatch",
      reason: "loaded discovery revision mismatch",
      events: [],
    };
  }
  if (loaded.discovery.declaredByteSize !== command.payload.byte_size) {
    return {
      ok: false,
      kind: "size_mismatch",
      reason: "declared byte size mismatch",
      events: [],
    };
  }

  return publishSandboxArtifactFromDiscovery(adapters, {
    ...loaded,
    contentBinding: {
      sha256: command.payload.content_hash,
      byteSize: command.payload.byte_size,
    },
  });
}

export function createTrueForgeDownloadAdapter(
  client: Pick<TrueForgeClient, "downloadSandboxFile">,
): SandboxArtifactPublishAdapters["downloadSandboxFile"] {
  return async ({ sessionId, turnId, sandboxPath }) => {
    const bytes = await client.downloadSandboxFile(sessionId, turnId, sandboxPath);
    return Buffer.from(bytes);
  };
}
