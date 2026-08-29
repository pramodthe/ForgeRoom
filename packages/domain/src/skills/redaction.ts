const FORBIDDEN_PAYLOAD_KEYS = new Set([
  "reasoning",
  "credentials",
  "credential",
  "secret",
  "token",
  "password",
  "api_key",
  "authorization",
  "raw_tool_body",
  "tool_body",
  "raw_result",
  "raw_output",
  "private_answer",
  "transient_answer",
  "provider_signature",
]);

function normalizePayloadKey(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

export function assertSkillEvidencePayloadSafe(value: unknown): void {
  walkForbiddenKeys(value);
}

function walkForbiddenKeys(value: unknown): void {
  if (value === null || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      walkForbiddenKeys(item);
    }
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = normalizePayloadKey(key);
    if (FORBIDDEN_PAYLOAD_KEYS.has(normalized) || FORBIDDEN_PAYLOAD_KEYS.has(key.toLowerCase())) {
      throw new Error(`forbidden payload marker present: ${key}`);
    }
    if (key === "raw_result_observed" && child === true) {
      throw new Error("forbidden payload marker present: raw_result_observed");
    }
    walkForbiddenKeys(child);
  }
}
