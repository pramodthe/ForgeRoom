/** Produce a Content-Disposition-safe attachment filename. */
export function toSafeArtifactFilename(name: string): string {
  const trimmed = name.trim();
  const sanitized = trimmed
    .replace(/[\u0000-\u001f\u007f]+/g, "")
    .replace(/["\\]/g, "_")
    .replace(/[^\w.\-()+ @]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 200);
  return sanitized.length > 0 ? sanitized : "artifact";
}
