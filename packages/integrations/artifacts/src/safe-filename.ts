/** Produce a Content-Disposition-safe attachment filename. */
export function toSafeArtifactFilename(name: string): string {
  const trimmed = name.trim();
  const withoutControlChars = [...trimmed]
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("");
  const sanitized = withoutControlChars
    .replace(/["\\]/g, "_")
    .replace(/[^\w.\-()+ @]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 200);
  return sanitized.length > 0 ? sanitized : "artifact";
}
