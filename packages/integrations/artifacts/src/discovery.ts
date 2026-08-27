import { P0_TRUEFORGE_SANDBOX_FILE_WIRE_TYPE } from "./extraction-p0-contract";
import { validateSandboxArtifactPath } from "./sandbox-path";

export type DiscoveredSandboxArtifact = {
  sandboxId: string;
  sandboxPath: string;
  relativePath: string;
  name: string;
  mimeType: string;
  declaredByteSize: number;
  trueforgeEventId: string;
  sourceWireType: typeof P0_TRUEFORGE_SANDBOX_FILE_WIRE_TYPE | "assistant.message";
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

function parseAssistantSandboxFiles(
  raw: Record<string, unknown>,
  activeSandboxId: string | null,
): DiscoveredSandboxArtifact[] {
  const content = readString(raw.content) ?? readString(raw.text);
  if (!content) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") {
    return [];
  }
  const files = (parsed as { sandbox_files?: unknown }).sandbox_files;
  if (!Array.isArray(files)) {
    return [];
  }
  const trueforgeEventId = readString(raw.id) ?? "missing_assistant_event";
  const sandboxId =
    readString((parsed as { sandbox_id?: unknown }).sandbox_id) ?? activeSandboxId;
  if (!sandboxId) {
    return [];
  }

  const discovered: DiscoveredSandboxArtifact[] = [];
  for (const item of files) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as Record<string, unknown>;
    const path =
      readString(row.path) ?? readString(row.sandbox_path) ?? readString(row.file_path);
    const mimeType = readString(row.mime_type) ?? readString(row.mimeType);
    const declaredByteSize =
      readNonNegativeInt(row.byte_size) ?? readNonNegativeInt(row.byteSize);
    if (!path || !mimeType || declaredByteSize === null) {
      continue;
    }
    const validated = validateSandboxArtifactPath(path);
    if (!validated.ok) {
      continue;
    }
    const name =
      readString(row.name) ?? validated.relativePath.split("/").pop() ?? validated.relativePath;
    discovered.push({
      sandboxId,
      sandboxPath: validated.normalizedPath,
      relativePath: validated.relativePath,
      name,
      mimeType,
      declaredByteSize,
      trueforgeEventId,
      sourceWireType: "assistant.message",
    });
  }
  return discovered;
}

function parseSandboxFileWireEvent(raw: Record<string, unknown>): DiscoveredSandboxArtifact | null {
  const sandboxId = readString(raw.sandbox_id) ?? readString(raw.sandboxId);
  const path = readString(raw.path) ?? readString(raw.sandbox_path) ?? readString(raw.file_path);
  const mimeType = readString(raw.mime_type) ?? readString(raw.mimeType);
  const declaredByteSize = readNonNegativeInt(raw.byte_size) ?? readNonNegativeInt(raw.byteSize);
  const trueforgeEventId = readString(raw.id) ?? "missing_sandbox_file_event";
  if (!sandboxId || !path || !mimeType || declaredByteSize === null) {
    return null;
  }
  const validated = validateSandboxArtifactPath(path);
  if (!validated.ok) {
    return null;
  }
  const name =
    readString(raw.name) ?? validated.relativePath.split("/").pop() ?? validated.relativePath;
  return {
    sandboxId,
    sandboxPath: validated.normalizedPath,
    relativePath: validated.relativePath,
    name,
    mimeType,
    declaredByteSize,
    trueforgeEventId,
    sourceWireType: P0_TRUEFORGE_SANDBOX_FILE_WIRE_TYPE,
  };
}

/**
 * Read artifact metadata from the expected TrueForge sandbox turn wire events.
 * Wire: sandbox.file and assistant.message JSON `sandbox_files` payloads.
 */
export function extractDiscoveredSandboxArtifacts(
  rawEvents: Array<Record<string, unknown>>,
): DiscoveredSandboxArtifact[] {
  const discovered: DiscoveredSandboxArtifact[] = [];
  const seen = new Set<string>();
  let activeSandboxId: string | null = null;

  for (const raw of rawEvents) {
    const type = readString(raw.type) ?? "unknown";
    if (type === "sandbox.created") {
      activeSandboxId = readString(raw.sandbox_id) ?? readString(raw.sandboxId);
      continue;
    }
    if (type === P0_TRUEFORGE_SANDBOX_FILE_WIRE_TYPE) {
      const item = parseSandboxFileWireEvent(raw);
      if (!item) {
        continue;
      }
      const key = `${item.sandboxId}:${item.sandboxPath}:${item.mimeType}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      discovered.push(item);
      continue;
    }
    if (type === "assistant.message" || type === "model.message") {
      for (const item of parseAssistantSandboxFiles(raw, activeSandboxId)) {
        const key = `${item.sandboxId}:${item.sandboxPath}:${item.mimeType}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        discovered.push(item);
      }
    }
  }

  return discovered;
}
