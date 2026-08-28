import type {
  MappedSandboxLifecycleEvent,
  RedactedSandboxEvidence,
  SandboxCommandState,
} from "@forgeroom/trueforge";

/** Application run events projected for channel timeline / persistence. */
export type ProjectedSandboxRunEvent = {
  normalizedType:
    "sandbox.created" | "sandbox.command_started" | "sandbox.command_completed" | "sandbox.failed";
  payloadRedacted: Record<string, unknown>;
};

export type ProjectedSandboxActivity = {
  activityType: "forgeroom.sandbox.v1";
  messageId: string;
  sandboxId: string;
  commandState: SandboxCommandState;
  activityRevision: number;
  replace: true;
};

const FORBIDDEN_PAYLOAD_FRAGMENTS = [
  "api_key",
  "authorization",
  "bearer ",
  "sk-",
  "ak_",
  "ca_",
  "dtn_",
  "password",
  "secret",
  "token",
] as const;

export function assertNoSandboxSecrets(payload: Record<string, unknown>): void {
  const serialized = JSON.stringify(payload).toLowerCase();
  for (const fragment of FORBIDDEN_PAYLOAD_FRAGMENTS) {
    if (serialized.includes(fragment)) {
      throw new Error(`sandbox payload contains forbidden fragment: ${fragment}`);
    }
  }
}

export function projectSandboxRunEvents(
  lifecycle: MappedSandboxLifecycleEvent[],
): ProjectedSandboxRunEvent[] {
  const events: ProjectedSandboxRunEvent[] = [];
  for (const item of lifecycle) {
    const payload = { ...item.payloadRedacted };
    assertNoSandboxSecrets(payload);
    events.push({
      normalizedType: item.applicationType,
      payloadRedacted: payload,
    });
  }
  return events;
}

export function projectSandboxActivitySnapshots(
  lifecycle: MappedSandboxLifecycleEvent[],
  messageIdPrefix = "act_sandbox",
): ProjectedSandboxActivity[] {
  const bySandbox = new Map<string, MappedSandboxLifecycleEvent>();
  for (const item of lifecycle) {
    bySandbox.set(item.sandboxId, item);
  }
  return [...bySandbox.values()].map((item, index) => ({
    activityType: "forgeroom.sandbox.v1",
    messageId: `${messageIdPrefix}_${item.sandboxId.slice(-8)}`,
    sandboxId: item.sandboxId,
    commandState: item.commandState,
    activityRevision: index,
    replace: true,
  }));
}

export type SandboxLifecycleDispatchResult = {
  lifecycle: MappedSandboxLifecycleEvent[];
  runEvents: ProjectedSandboxRunEvent[];
  activities: ProjectedSandboxActivity[];
  evidence: RedactedSandboxEvidence;
};

export function dispatchSandboxLifecycleProjection(input: {
  wireEvents: Array<Record<string, unknown>>;
  mapWire: (events: Array<Record<string, unknown>>) => MappedSandboxLifecycleEvent[];
  evidence: RedactedSandboxEvidence;
}): SandboxLifecycleDispatchResult {
  const lifecycle = input.mapWire(input.wireEvents);
  const runEvents = projectSandboxRunEvents(lifecycle);
  const activities = projectSandboxActivitySnapshots(lifecycle);
  return {
    lifecycle,
    runEvents,
    activities,
    evidence: input.evidence,
  };
}
