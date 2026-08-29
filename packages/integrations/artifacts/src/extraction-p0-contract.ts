/** Relative sandbox root for P0 Daytona fixtures (ADR-005). */
export const P0_SANDBOX_ARTIFACT_ROOT = "/home/daytona/" as const;

/** Maximum artifact byte size for P0 demo/fixture path (8 KiB). */
export const P0_MAX_ARTIFACT_BYTES = 8_192 as const;

/** Maximum decoded raster pixels before ImageCard preview (GUI-006). */
export const P0_MAX_IMAGE_PIXELS = 16_000_000 as const;

/** Maximum encoded raster bytes accepted for image decode/re-encode. */
export const P0_MAX_IMAGE_ENCODED_BYTES = 2_097_152 as const;

export const P0_ALLOWED_ARTIFACT_MIME_TYPES = [
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/pdf",
  "application/zip",
  "application/octet-stream",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type P0AllowedArtifactMimeType = (typeof P0_ALLOWED_ARTIFACT_MIME_TYPES)[number];

export const P0_FORBIDDEN_ARTIFACT_MIME_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "application/javascript",
  "text/javascript",
  "application/xml",
] as const;

/** Frozen fixture path used by P0-311/P0-312 verification. */
export const P0_SANDBOX_ARTIFACT_FIXTURE_PATH = "forgeroom-p0-probe-sample.md" as const;
