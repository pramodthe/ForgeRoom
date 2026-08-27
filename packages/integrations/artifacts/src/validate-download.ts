import {
  P0_ALLOWED_ARTIFACT_MIME_TYPES,
  P0_FORBIDDEN_ARTIFACT_MIME_TYPES,
  P0_MAX_ARTIFACT_BYTES,
  type P0AllowedArtifactMimeType,
} from "./extraction-p0-contract";
import type { DiscoveredSandboxArtifact } from "./discovery";
import { hashArtifactContent } from "./hash";

export type ArtifactDownloadValidationFailure =
  | "path_invalid"
  | "mime_forbidden"
  | "mime_not_allowed"
  | "size_mismatch"
  | "size_exceeded"
  | "empty_content";

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

export function isAllowedArtifactMimeType(
  mimeType: string,
): mimeType is P0AllowedArtifactMimeType {
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
}): { ok: true; value: ValidatedArtifactDownload } | { ok: false; reason: ArtifactDownloadValidationFailure } {
  const { discovery, content } = input;
  if (!discovery.sandboxPath.startsWith("/home/daytona/")) {
    return { ok: false, reason: "path_invalid" };
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
  if (content.byteLength !== discovery.declaredByteSize) {
    return { ok: false, reason: "size_mismatch" };
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
  if (!discovery.sandboxPath.startsWith("/home/daytona/")) {
    return { ok: false, reason: "path_invalid" };
  }
  if (isForbiddenArtifactMimeType(discovery.mimeType)) {
    return { ok: false, reason: "mime_forbidden" };
  }
  if (!isAllowedArtifactMimeType(discovery.mimeType)) {
    return { ok: false, reason: "mime_not_allowed" };
  }
  if (discovery.declaredByteSize <= 0) {
    return { ok: false, reason: "empty_content" };
  }
  if (discovery.declaredByteSize > P0_MAX_ARTIFACT_BYTES) {
    return { ok: false, reason: "size_exceeded" };
  }
  return { ok: true };
}
