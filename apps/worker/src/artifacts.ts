import {
  loadSandboxArtifactDiscoveryBinding,
  publishArtifactRecord,
  type createSql,
} from "@forgeroom/db";
import {
  loadArtifactStorageFromEnv,
  storeArtifactContent,
  type ArtifactStorageAdapter,
} from "@forgeroom/artifacts";
import type {
  PublishSandboxArtifactCommand,
  SandboxArtifactPublishAdapters,
  SandboxArtifactPublishInput,
} from "@forgeroom/orchestration/artifact-extraction";

type SqlClient = ReturnType<typeof createSql>;

export function createWorkerArtifactPublishAdapter(input: {
  sql: SqlClient;
  storage?: ArtifactStorageAdapter;
}): SandboxArtifactPublishAdapters["publishArtifact"] {
  const storage = input.storage ?? loadArtifactStorageFromEnv(process.env);
  return async (publishInput) => {
    const stored = await storeArtifactContent(storage, {
      workspaceId: publishInput.workspaceId,
      channelId: publishInput.channelId,
      revision: publishInput.revision,
      content: publishInput.content,
    });
    const recordResult = await publishArtifactRecord(input.sql, {
      id: publishInput.id,
      workspaceId: publishInput.workspaceId,
      channelId: publishInput.channelId,
      runId: publishInput.runId,
      runStepId: publishInput.runStepId,
      creatorAgentId: publishInput.creatorAgentId,
      kind: publishInput.kind,
      name: publishInput.name,
      mimeType: publishInput.mimeType,
      storageKey: stored.storageKey,
      byteSize: stored.byteSize,
      sha256: stored.sha256,
      sourceSandboxId: publishInput.sourceSandboxId,
      sourceSandboxPath: publishInput.sourceSandboxPath,
      revision: publishInput.revision,
      metadataJson: publishInput.metadataJson,
      createdAt: new Date().toISOString(),
    });
    if (!recordResult.ok) {
      return {
        ok: false,
        reason: recordResult.reason,
      };
    }
    return {
      ok: true,
      created: recordResult.created,
      sha256: recordResult.artifact.sha256,
      byteSize: recordResult.artifact.byteSize,
    };
  };
}

export function createWorkerArtifactDiscoveryLoader(input: {
  sql: SqlClient;
}): (command: PublishSandboxArtifactCommand) => Promise<SandboxArtifactPublishInput | null> {
  return async (command) => {
    const binding = await loadSandboxArtifactDiscoveryBinding(input.sql, {
      artifactId: command.payload.artifact_id,
      runId: command.payload.run_id,
      runStepId: command.payload.run_step_id,
      sandboxId: command.payload.sandbox_id,
      nextRevision: command.payload.next_artifact_revision,
    });
    if (!binding) {
      return null;
    }
    if (
      binding.runId !== command.payload.run_id ||
      binding.runStepId !== command.payload.run_step_id ||
      binding.discovery.sandboxId !== command.payload.sandbox_id
    ) {
      return null;
    }
    return {
      workspaceId: binding.workspaceId,
      channelId: binding.channelId,
      runId: binding.runId,
      runStepId: binding.runStepId,
      creatorAgentId: binding.creatorAgentId,
      trueforgeSessionId: binding.trueforgeSessionId,
      trueforgeTurnId: binding.trueforgeTurnId,
      artifactId: binding.artifactId,
      revision: binding.revision,
      discovery: binding.discovery,
      sandboxCommandState: binding.sandboxCommandState,
    };
  };
}
