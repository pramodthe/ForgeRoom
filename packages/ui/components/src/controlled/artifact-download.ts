const SAFE_ARTIFACT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function safeArtifactDownloadPath(artifactId: unknown): string | undefined {
  if (typeof artifactId !== "string" || artifactId.length === 0 || artifactId.length > 128) {
    return undefined;
  }
  if (!SAFE_ARTIFACT_ID_PATTERN.test(artifactId)) {
    return undefined;
  }
  return `/api/artifacts/${encodeURIComponent(artifactId)}/download`;
}
