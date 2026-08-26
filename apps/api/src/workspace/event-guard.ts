import {
  agentChannelEnvelopeSchema,
  isP0UnsupportedCapability,
  type AgentChannelEnvelope,
  type P0PersistedAguiEvent,
} from "@forgeroom/contracts";

/** Keys / substrings that must never land in channel JSON (P0 full_event only). */
const FORBIDDEN_CHANNEL_JSON_KEYS = [
  "generated_source_ref",
  "generatedsourceref",
  "generatedsourceeventref",
  "source_revision_id",
  "sourcerevisionid",
  "retained_snapshot_blob_key",
  "retainedsnapshotblobkey",
  "blob_key",
  "blobkey",
  "capability_url",
  "capabilityurl",
  "iframe_url",
  "iframeurl",
  "interaction_token",
  "interactiontoken",
  "raw_html",
  "rawhtml",
  "raw_css",
  "rawcss",
  "js_functions",
  "jsfunctions",
  "js_expressions",
  "jsexpressions",
  "behavior_source",
  "behaviorsource",
  "delivery_body",
  "deliverybody",
  "open-generative-ui",
  "opengenerativeui",
] as const;

function normalizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

const forbiddenNormalized = new Set(FORBIDDEN_CHANNEL_JSON_KEYS.map(normalizeKey));

export class ChannelEventPersistenceError extends Error {
  readonly code = "validation_failed" as const;

  constructor(message: string) {
    super(message);
    this.name = "ChannelEventPersistenceError";
  }
}

function assertNoForbiddenKeys(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoForbiddenKeys(entry, `${path}[${index}]`));
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalized = normalizeKey(key);
    if (
      forbiddenNormalized.has(normalized) ||
      normalized.includes("generatedsourceref") ||
      normalized.endsWith("blobkey") ||
      normalized.endsWith("capabilityurl") ||
      normalized.includes("opengenerative")
    ) {
      throw new ChannelEventPersistenceError(
        `Forbidden channel JSON field at ${path}.${key}: P0 persists full_event only and rejects generated source refs, blob keys, and capability URLs.`,
      );
    }
    if (isP0UnsupportedCapability(key) || isP0UnsupportedCapability(String(child))) {
      throw new ChannelEventPersistenceError(`Unsupported P0 capability at ${path}.${key}: ${key}`);
    }
    assertNoForbiddenKeys(child, `${path}.${key}`);
  }
}

function assertAllowedAguiEvent(aguiEvent: P0PersistedAguiEvent): void {
  if (isP0UnsupportedCapability(aguiEvent.type)) {
    throw new ChannelEventPersistenceError(
      `AG-UI event type ${aguiEvent.type} is not persistable in P0.`,
    );
  }
  if (aguiEvent.type === "ACTIVITY_SNAPSHOT" || aguiEvent.type === "ACTIVITY_DELTA") {
    if (isP0UnsupportedCapability(aguiEvent.activityType)) {
      throw new ChannelEventPersistenceError(
        `Activity type ${aguiEvent.activityType} is not persistable in P0.`,
      );
    }
  }
  if (aguiEvent.type === "CUSTOM" && isP0UnsupportedCapability(aguiEvent.name)) {
    throw new ChannelEventPersistenceError(
      `CUSTOM name ${aguiEvent.name} is not persistable in P0.`,
    );
  }
}

/**
 * Validate a durable envelope and reject P1 generated-source / iframe / raw-source fields
 * before they can be written to payload_json / agui_event_json.
 */
export function assertPersistableChannelEnvelope(input: unknown): AgentChannelEnvelope {
  assertNoForbiddenKeys(input, "envelope");
  const parsed = agentChannelEnvelopeSchema.safeParse(input);
  if (!parsed.success) {
    throw new ChannelEventPersistenceError(
      `Invalid AgentChannelEnvelope: ${parsed.error.issues[0]?.message ?? "schema validation failed"}`,
    );
  }
  assertAllowedAguiEvent(parsed.data.aguiEvent);
  assertNoForbiddenKeys(parsed.data, "envelope");
  return parsed.data;
}
