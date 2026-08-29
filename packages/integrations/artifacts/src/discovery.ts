import { validateSandboxArtifactPath } from "./sandbox-path";

export type DiscoveredSandboxArtifact = {
  sandboxId: string;
  sandboxPath: string;
  relativePath: string;
  name: string;
  mimeType: string;
  declaredByteSize: number | null;
  trueforgeEventId: string;
  sourceWireType: "model.message";
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function mimeTypeForPath(path: string): string | null {
  const lower = path.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "text/markdown";
  if (lower.endsWith(".txt") || lower.endsWith(".log")) return "text/plain";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return null;
}

function parseSandboxArtifactBlock(
  raw: Record<string, unknown>,
  activeSandboxId: string | null,
): DiscoveredSandboxArtifact[] {
  const content = readString(raw.content) ?? readString(raw.text);
  if (!content || !activeSandboxId) return [];
  const trueforgeEventId = readString(raw.id) ?? "missing_assistant_event";
  const discovered: DiscoveredSandboxArtifact[] = [];
  for (const block of content.matchAll(/```sandbox_artifacts\s*\n([\s\S]*?)```/giu)) {
    for (const line of (block[1] ?? "").split(/\r?\n/u)) {
      const link = line.trim().match(/^\[([^\]\r\n]+)\]\((\/[^)\r\n]+)\)$/u);
      if (!link) continue;
      const validated = validateSandboxArtifactPath(link[2]!);
      const mimeType = validated.ok ? mimeTypeForPath(validated.normalizedPath) : null;
      if (!validated.ok || !mimeType) continue;
      discovered.push({
        sandboxId: activeSandboxId,
        sandboxPath: validated.normalizedPath,
        relativePath: validated.relativePath,
        name: link[1]!,
        mimeType,
        declaredByteSize: null,
        trueforgeEventId,
        sourceWireType: "model.message",
      });
    }
  }
  return discovered;
}

/**
 * Read artifact paths from TrueForge's canonical fenced `sandbox_artifacts`
 * block in model.message output. The byte size is established from the bounded
 * download because the provider wire contract intentionally declares only paths.
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
    if (type === "model.message") {
      for (const item of parseSandboxArtifactBlock(raw, activeSandboxId)) {
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
