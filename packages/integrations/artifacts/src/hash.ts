import { createHash } from "node:crypto";

export function hashArtifactContent(content: Buffer): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

export function sha256Hex(digest: string): string {
  return digest.startsWith("sha256:") ? digest.slice("sha256:".length) : digest;
}
