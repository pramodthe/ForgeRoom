function humanizeKey(key: string): string {
  return key.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatScalar(value: string | number | boolean): string {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  return String(value);
}

/**
 * Render redacted approval/question payloads as readable labels instead of raw JSON.
 */
export function formatRedactedRecord(value: unknown, depth = 0): string {
  if (value === null || value === undefined) {
    return "Not provided";
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : "Not provided";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return formatScalar(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "No items";
    }
    return value
      .map((entry, index) => {
        const formatted = formatRedactedRecord(entry, depth + 1);
        return formatted.includes("\n")
          ? `${index + 1}.\n${formatted
              .split("\n")
              .map((line) => `  ${line}`)
              .join("\n")}`
          : `${index + 1}. ${formatted}`;
      })
      .join("\n");
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return "No details";
    }
    return entries
      .map(([key, entryValue]) => {
        const formatted = formatRedactedRecord(entryValue, depth + 1);
        if (formatted.includes("\n")) {
          return `${humanizeKey(key)}:\n${formatted
            .split("\n")
            .map((line) => `  ${line}`)
            .join("\n")}`;
        }
        return `${humanizeKey(key)}: ${formatted}`;
      })
      .join("\n");
  }
  return String(value);
}
