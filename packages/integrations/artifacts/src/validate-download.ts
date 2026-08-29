import { inflateRawSync } from "node:zlib";

import {
  P0_ALLOWED_ARTIFACT_MIME_TYPES,
  P0_FORBIDDEN_ARTIFACT_MIME_TYPES,
  P0_MAX_ARTIFACT_BYTES,
  type P0AllowedArtifactMimeType,
} from "./extraction-p0-contract";
import type { DiscoveredSandboxArtifact } from "./discovery";
import { hashArtifactContent } from "./hash";
import { validateSandboxArtifactPath } from "./sandbox-path";

export type ArtifactDownloadValidationFailure =
  | "path_invalid"
  | "mime_forbidden"
  | "mime_not_allowed"
  | "size_mismatch"
  | "size_exceeded"
  | "empty_content"
  | "sensitive_path"
  | "sensitive_content"
  | "archive_invalid";

export type ValidatedArtifactDownload = {
  discovery: DiscoveredSandboxArtifact;
  content: Buffer;
  sha256: string;
  byteSize: number;
  mimeType: P0AllowedArtifactMimeType;
};

function normalizeMime(value: string): string {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}

const SENSITIVE_PATH_PATTERN =
  /(?:^|\/)(?:\.env(?:\.|$)|credentials?(?:\.|$)|secrets?(?:\.|$)|id_(?:rsa|ed25519)(?:\.|$)|tool[-_. ]?(?:output|response|result)(?:\.|$))/iu;
const SENSITIVE_CONTENT_PATTERNS = [
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/u,
  /\b(?:OPENAI|COMPOSIO|DAYTONA)_API_KEY\s*[:=]\s*["']?(?!\[REDACTED\])[^\s,"']+/iu,
  /["']?(?:access_token|refresh_token|authorization|cookie|set-cookie|api_key|owner_password|raw_body|tool_response|tool_output)["']?\s*[:=]\s*["']?(?!\[REDACTED\])[^\s,"'}]+/iu,
] as const;

function isSensitiveArtifactPath(path: string): boolean {
  return SENSITIVE_PATH_PATTERN.test(path);
}

function containsSensitiveText(content: Buffer): boolean {
  const text = content.toString("utf8");
  return SENSITIVE_CONTENT_PATTERNS.some((pattern) => pattern.test(text));
}

function inspectZipContent(content: Buffer): "safe" | "sensitive" | "invalid" {
  let endOffset = -1;
  for (let offset = content.length - 22; offset >= Math.max(0, content.length - 65_557); offset--) {
    if (content.readUInt32LE(offset) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0 || endOffset + 22 > content.length) return "invalid";
  const entryCount = content.readUInt16LE(endOffset + 10);
  const centralOffset = content.readUInt32LE(endOffset + 16);
  if (entryCount === 0xffff || centralOffset === 0xffffffff) return "invalid";

  let offset = centralOffset;
  let inspectedBytes = 0;
  try {
    for (let index = 0; index < entryCount; index++) {
      if (offset + 46 > content.length || content.readUInt32LE(offset) !== 0x02014b50) {
        return "invalid";
      }
      const flags = content.readUInt16LE(offset + 8);
      const method = content.readUInt16LE(offset + 10);
      const compressedSize = content.readUInt32LE(offset + 20);
      const uncompressedSize = content.readUInt32LE(offset + 24);
      const nameLength = content.readUInt16LE(offset + 28);
      const extraLength = content.readUInt16LE(offset + 30);
      const commentLength = content.readUInt16LE(offset + 32);
      const localOffset = content.readUInt32LE(offset + 42);
      const nameEnd = offset + 46 + nameLength;
      if (nameEnd > content.length || (flags & 0x1) !== 0) return "invalid";
      const name = content.subarray(offset + 46, nameEnd).toString("utf8");
      if (isSensitiveArtifactPath(name)) return "sensitive";
      if (localOffset + 30 > content.length || content.readUInt32LE(localOffset) !== 0x04034b50) {
        return "invalid";
      }
      const localNameLength = content.readUInt16LE(localOffset + 26);
      const localExtraLength = content.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const dataEnd = dataStart + compressedSize;
      if (dataEnd > content.length) return "invalid";
      inspectedBytes += uncompressedSize;
      if (inspectedBytes > P0_MAX_ARTIFACT_BYTES) return "invalid";
      const compressed = content.subarray(dataStart, dataEnd);
      const entry =
        method === 0
          ? compressed
          : method === 8
            ? inflateRawSync(compressed, { maxOutputLength: P0_MAX_ARTIFACT_BYTES })
            : null;
      if (!entry || entry.byteLength !== uncompressedSize) return "invalid";
      if (containsSensitiveText(entry)) return "sensitive";
      offset = nameEnd + extraLength + commentLength;
    }
  } catch {
    return "invalid";
  }
  return "safe";
}

export function isAllowedArtifactMimeType(mimeType: string): mimeType is P0AllowedArtifactMimeType {
  const normalized = normalizeMime(mimeType);
  return (P0_ALLOWED_ARTIFACT_MIME_TYPES as readonly string[]).includes(normalized);
}

export function isForbiddenArtifactMimeType(mimeType: string): boolean {
  const normalized = normalizeMime(mimeType);
  return (P0_FORBIDDEN_ARTIFACT_MIME_TYPES as readonly string[]).includes(normalized);
}

export function validateDiscoveredArtifactDownload(input: {
  discovery: DiscoveredSandboxArtifact;
  content: Buffer;
}):
  | { ok: true; value: ValidatedArtifactDownload }
  | { ok: false; reason: ArtifactDownloadValidationFailure } {
  const { discovery, content } = input;
  const validatedPath = validateSandboxArtifactPath(discovery.sandboxPath);
  if (!validatedPath.ok) {
    return { ok: false, reason: "path_invalid" };
  }
  if (isSensitiveArtifactPath(validatedPath.relativePath)) {
    return { ok: false, reason: "sensitive_path" };
  }
  if (isForbiddenArtifactMimeType(discovery.mimeType)) {
    return { ok: false, reason: "mime_forbidden" };
  }
  if (!isAllowedArtifactMimeType(discovery.mimeType)) {
    return { ok: false, reason: "mime_not_allowed" };
  }
  if (content.byteLength === 0) {
    return { ok: false, reason: "empty_content" };
  }
  if (content.byteLength > P0_MAX_ARTIFACT_BYTES) {
    return { ok: false, reason: "size_exceeded" };
  }
  if (discovery.declaredByteSize !== null && content.byteLength !== discovery.declaredByteSize) {
    return { ok: false, reason: "size_mismatch" };
  }
  const contentInspection =
    normalizeMime(discovery.mimeType) === "application/zip"
      ? inspectZipContent(content)
      : containsSensitiveText(content)
        ? "sensitive"
        : "safe";
  if (contentInspection === "sensitive") {
    return { ok: false, reason: "sensitive_content" };
  }
  if (contentInspection === "invalid") {
    return { ok: false, reason: "archive_invalid" };
  }

  return {
    ok: true,
    value: {
      discovery,
      content,
      sha256: hashArtifactContent(content),
      byteSize: content.byteLength,
      mimeType: normalizeMime(discovery.mimeType) as P0AllowedArtifactMimeType,
    },
  };
}

/** Pre-download gate using declared metadata only (path/size/MIME). */
export function validateDiscoveredArtifactMetadata(
  discovery: DiscoveredSandboxArtifact,
): { ok: true } | { ok: false; reason: ArtifactDownloadValidationFailure } {
  const validatedPath = validateSandboxArtifactPath(discovery.sandboxPath);
  if (!validatedPath.ok) {
    return { ok: false, reason: "path_invalid" };
  }
  if (isSensitiveArtifactPath(validatedPath.relativePath)) {
    return { ok: false, reason: "sensitive_path" };
  }
  if (isForbiddenArtifactMimeType(discovery.mimeType)) {
    return { ok: false, reason: "mime_forbidden" };
  }
  if (!isAllowedArtifactMimeType(discovery.mimeType)) {
    return { ok: false, reason: "mime_not_allowed" };
  }
  if (discovery.declaredByteSize !== null && discovery.declaredByteSize <= 0) {
    return { ok: false, reason: "empty_content" };
  }
  if (discovery.declaredByteSize !== null && discovery.declaredByteSize > P0_MAX_ARTIFACT_BYTES) {
    return { ok: false, reason: "size_exceeded" };
  }
  return { ok: true };
}
