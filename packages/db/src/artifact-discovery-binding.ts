import type { createSql } from "./client";

type SqlClient = ReturnType<typeof createSql>;

const P0_SANDBOX_ARTIFACT_ROOT = "/home/daytona";
const P0_TRUEFORGE_SANDBOX_FILE_WIRE_TYPE = "sandbox.file" as const;

export type ArtifactDiscoveryBinding = {
  workspaceId: string;
  channelId: string;
  runId: string;
  runStepId: string;
  creatorAgentId: string;
  trueforgeSessionId: string;
  trueforgeTurnId: string;
  artifactId: string;
  revision: number;
  discovery: {
    sandboxId: string;
    sandboxPath: string;
    relativePath: string;
    name: string;
    mimeType: string;
    declaredByteSize: number;
    trueforgeEventId: string;
    sourceWireType: typeof P0_TRUEFORGE_SANDBOX_FILE_WIRE_TYPE | "assistant.message";
  };
  sandboxCommandState: "creating" | "running" | "completed" | "failed";
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNonNegativeInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}

function resolveSandboxPath(relativePath: string): { sandboxPath: string; relativePath: string } | null {
  const trimmed = relativePath.trim();
  if (!trimmed || trimmed.includes("..") || trimmed.includes("\\")) {
    return null;
  }
  const root = P0_SANDBOX_ARTIFACT_ROOT.replace(/\/+$/, "");
  const sandboxPath = `${root}/${trimmed.replace(/^\/+/, "")}`;
  if (!sandboxPath.startsWith(`${root}/`)) {
    return null;
  }
  return { sandboxPath, relativePath: trimmed.replace(/^\/+/, "") };
}

function resolveSandboxCommandState(
  events: Array<{ normalizedType: string; payload: Record<string, unknown> }>,
  sandboxId: string,
): ArtifactDiscoveryBinding["sandboxCommandState"] {
  let state: ArtifactDiscoveryBinding["sandboxCommandState"] = "creating";
  for (const event of events) {
    const eventSandboxId = readString(event.payload.sandbox_id) ?? readString(event.payload.sandboxId);
    if (eventSandboxId !== sandboxId) {
      continue;
    }
    if (event.normalizedType === "sandbox.command_completed") {
      return "completed";
    }
    if (event.normalizedType === "sandbox.failed") {
      return "failed";
    }
    if (event.normalizedType === "sandbox.command_started") {
      state = "running";
    }
    if (event.normalizedType === "sandbox.created") {
      state = "creating";
    }
  }
  return state;
}

export async function loadSandboxArtifactDiscoveryBinding(
  sql: SqlClient,
  input: {
    artifactId: string;
    runId: string;
    runStepId: string;
    sandboxId: string;
    nextRevision: number;
  },
): Promise<ArtifactDiscoveryBinding | null> {
  const contextRows = await sql<
    Array<{
      run_step_id: string;
      run_id: string;
      creator_agent_id: string;
      channel_id: string;
      workspace_id: string;
      trueforge_turn_id: string | null;
      trueforge_session_id: string;
    }>
  >`
    SELECT
      rs.id AS run_step_id,
      rs.run_id,
      rs.assigned_agent_id AS creator_agent_id,
      r.channel_id,
      cas.workspace_id,
      at.trueforge_turn_id,
      csg.trueforge_session_id
    FROM run_steps AS rs
    JOIN runs AS r ON r.id = rs.run_id
    JOIN agent_turns AS at ON at.run_step_id = rs.id
    JOIN channel_agent_sessions AS cas ON cas.id = at.channel_agent_session_id
    JOIN channel_agent_session_generations AS csg ON csg.id = at.session_generation_id
    WHERE rs.id = ${input.runStepId}
      AND rs.run_id = ${input.runId}
    ORDER BY at.started_at DESC NULLS LAST, at.id DESC
    LIMIT 1
  `;
  const context = contextRows[0];
  if (!context?.trueforge_turn_id) {
    return null;
  }

  const eventRows = await sql<
    Array<{
      normalized_type: string;
      normalized_payload_redacted_json: Record<string, unknown>;
      trueforge_event_id: string;
    }>
  >`
    SELECT
      re.normalized_type,
      re.normalized_payload_redacted_json,
      re.trueforge_event_id
    FROM run_events AS re
    JOIN agent_turns AS at ON at.id = re.agent_turn_id
    WHERE at.run_step_id = ${input.runStepId}
    ORDER BY re.first_seen_at ASC, re.id ASC
  `;

  const sandboxEvents = eventRows.map((row) => ({
    normalizedType: row.normalized_type,
    payload: row.normalized_payload_redacted_json ?? {},
  }));

  const discovered = eventRows.find((row) => {
    if (row.normalized_type !== "artifact.discovered") {
      return false;
    }
    const payload = row.normalized_payload_redacted_json ?? {};
    return readString(payload.artifact_id) === input.artifactId;
  });
  if (!discovered) {
    return null;
  }

  const payload = discovered.normalized_payload_redacted_json ?? {};
  const sandboxId = readString(payload.sandbox_id);
  if (!sandboxId || sandboxId !== input.sandboxId) {
    return null;
  }
  const relativePath = readString(payload.source_sandbox_path);
  const name = readString(payload.name);
  const mimeType = readString(payload.mime_type);
  const declaredByteSize = readNonNegativeInt(payload.byte_size);
  if (!relativePath || !name || !mimeType || declaredByteSize === null) {
    return null;
  }
  const resolvedPath = resolveSandboxPath(relativePath);
  if (!resolvedPath) {
    return null;
  }

  return {
    workspaceId: context.workspace_id,
    channelId: context.channel_id,
    runId: context.run_id,
    runStepId: context.run_step_id,
    creatorAgentId: context.creator_agent_id,
    trueforgeSessionId: context.trueforge_session_id,
    trueforgeTurnId: context.trueforge_turn_id,
    artifactId: input.artifactId,
    revision: input.nextRevision,
    discovery: {
      sandboxId,
      sandboxPath: resolvedPath.sandboxPath,
      relativePath: resolvedPath.relativePath,
      name,
      mimeType,
      declaredByteSize,
      trueforgeEventId: discovered.trueforge_event_id,
      sourceWireType: P0_TRUEFORGE_SANDBOX_FILE_WIRE_TYPE,
    },
    sandboxCommandState: resolveSandboxCommandState(sandboxEvents, sandboxId),
  };
}
