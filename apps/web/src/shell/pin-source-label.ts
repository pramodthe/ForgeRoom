/** Build a bounded pin label from durable source content. */
export function pinLabelFromMessageBody(body: string): string {
  const firstLine = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  const candidate = (firstLine ?? "Pinned message").replace(/\s+/g, " ").trim();
  return candidate.length <= 80 ? candidate : `${candidate.slice(0, 77)}…`;
}

export function pinLabelFromArtifactName(name: string): string {
  const trimmed = name.trim() || "Pinned artifact";
  return trimmed.length <= 80 ? trimmed : `${trimmed.slice(0, 77)}…`;
}
