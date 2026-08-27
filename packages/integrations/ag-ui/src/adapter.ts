import { EventSchemas, EventType } from "@ag-ui/core";
import { isP0UnsupportedCapability } from "@forgeroom/contracts";
import {
  evaluateTurnDoneOutcome,
  normalizeTrueForgeEvent,
} from "@forgeroom/orchestration/event-normalize";
import { buildForgeRoomEventMetadata } from "./metadata";
import { parseUpstreamAgUiEvent } from "./upstream";

export type TrueForgeAdapterContext = {
  channelId: string;
  coworkerId: string;
  logicalThreadId: string;
  aguiRunId: string;
  applicationRunId?: string;
  runStepId?: string;
  agentTurnId?: string;
};

type AgUiEventRecord = Record<string, unknown>;

function opaqueMessageId(prefix: string): string {
  return `${prefix}_${Math.random().toString(16).slice(2, 10)}`;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readTextDelta(raw: Record<string, unknown>): string | null {
  return (
    readString(raw.text) ??
    readString(raw.delta) ??
    readString(raw.content) ??
    readString(raw.message)
  );
}

/** Stable interrupt refs from TrueForge required_actions (provider action ids). */
export function extractRequiredActionInterruptRefs(
  raw: Record<string, unknown>,
): Array<{ id: string; reason?: string }> {
  const state =
    raw.state && typeof raw.state === "object" && !Array.isArray(raw.state)
      ? (raw.state as Record<string, unknown>)
      : raw;
  const required =
    (Array.isArray(state.required_actions) ? state.required_actions : null) ??
    (Array.isArray(state.requiredActions) ? state.requiredActions : null) ??
    [];
  const refs: Array<{ id: string; reason?: string }> = [];
  for (const item of required) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id =
      readString(record.id) ??
      readString(record.provider_action_id) ??
      readString(record.providerActionId);
    if (!id) continue;
    const type = (readString(record.type) ?? "").toLowerCase();
    const reason = type.includes("approval")
      ? "approval_required"
      : type.includes("auth") || type.includes("connection")
        ? "connection_required"
        : "input_required";
    refs.push({ id, reason });
  }
  return refs;
}

export function shouldDiscardTrueForgeEventType(type: string): boolean {
  return (
    type === "RAW" ||
    type.startsWith("REASONING_") ||
    type.startsWith("THINKING_") ||
    type.startsWith("reasoning.") ||
    type.startsWith("thinking.")
  );
}

export class TrueForgeAGUIAdapter {
  private readonly metadata: ReturnType<typeof buildForgeRoomEventMetadata>;
  private finished = false;
  private activeMessageId: string | null = null;
  private seenTrueForgeEventIds = new Set<string>();

  constructor(private readonly context: TrueForgeAdapterContext) {
    this.metadata = buildForgeRoomEventMetadata(context);
  }

  buildRunStarted(): AgUiEventRecord {
    return this.validate({
      type: EventType.RUN_STARTED,
      threadId: this.context.logicalThreadId,
      runId: this.context.aguiRunId,
      metadata: this.metadata,
    });
  }

  mapTrueForgeEvent(rawInput: Record<string, unknown>): AgUiEventRecord[] {
    if (this.finished) {
      return [];
    }
    const type = readString(rawInput.type) ?? "unknown";
    if (shouldDiscardTrueForgeEventType(type)) {
      return [];
    }

    let normalizedId: string;
    try {
      normalizedId = normalizeTrueForgeEvent(rawInput).trueforgeEventId;
    } catch {
      return [];
    }
    if (this.seenTrueForgeEventIds.has(normalizedId)) {
      return [];
    }
    this.seenTrueForgeEventIds.add(normalizedId);

    if (isP0UnsupportedCapability(type)) {
      return this.mapUnsupportedCapabilityActivity(type, "Capability is unsupported in P0.");
    }

    if (type === "turn.done") {
      return this.mapTurnDone(rawInput);
    }
    if (type === "turn.error" || type === "turn.failed" || type === "session.error") {
      return this.mapRunError(rawInput);
    }
    if (this.isTextStart(type)) {
      return this.startAssistantText(rawInput);
    }
    if (this.isTextDelta(type)) {
      return this.appendAssistantText(rawInput);
    }
    if (this.isTextEnd(type)) {
      return this.endAssistantText();
    }
    if (type.startsWith("tool.") || type.startsWith("tool_")) {
      return this.mapUnsupportedCapabilityActivity(
        "controlled_tool_mapping",
        "Controlled tool mapping is partial in P0-211 bootstrap.",
      );
    }
    if (type.startsWith("subagent.") || type.startsWith("SUBAGENT_")) {
      return this.mapUnsupportedCapabilityActivity(
        "native_subagent",
        "Native subagents are disabled in P0.",
      );
    }
    if (type.includes("open_ui") || type.includes("generative")) {
      return this.mapUnsupportedCapabilityActivity(
        "open_generated_ui",
        "Open generated UI is disabled in P0.",
      );
    }
    return [];
  }

  private isTextStart(type: string): boolean {
    return (
      type === "model.message.start" ||
      type === "assistant.message.start" ||
      type === "message.start"
    );
  }

  private isTextDelta(type: string): boolean {
    return (
      type === "model.message.delta" ||
      type === "assistant.message.delta" ||
      type === "message.delta" ||
      type === "model.output.delta"
    );
  }

  private isTextEnd(type: string): boolean {
    return (
      type === "model.message.end" ||
      type === "assistant.message.end" ||
      type === "message.end" ||
      type === "assistant.message.done"
    );
  }

  private startAssistantText(raw: Record<string, unknown>): AgUiEventRecord[] {
    const events: AgUiEventRecord[] = [];
    if (!this.activeMessageId) {
      this.activeMessageId = readString(raw.message_id) ?? opaqueMessageId("msg_asst");
      events.push(
        this.validate({
          type: EventType.TEXT_MESSAGE_START,
          messageId: this.activeMessageId,
          role: "assistant",
          metadata: this.metadata,
        }),
      );
    }
    const delta = readTextDelta(raw);
    if (delta) {
      events.push(
        this.validate({
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: this.activeMessageId,
          delta,
          metadata: this.metadata,
        }),
      );
    }
    return events;
  }

  private appendAssistantText(raw: Record<string, unknown>): AgUiEventRecord[] {
    const delta = readTextDelta(raw);
    if (!delta) {
      return [];
    }
    if (!this.activeMessageId) {
      this.activeMessageId = opaqueMessageId("msg_asst");
      return [
        this.validate({
          type: EventType.TEXT_MESSAGE_START,
          messageId: this.activeMessageId,
          role: "assistant",
          metadata: this.metadata,
        }),
        this.validate({
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: this.activeMessageId,
          delta,
          metadata: this.metadata,
        }),
      ];
    }
    return [
      this.validate({
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: this.activeMessageId,
        delta,
        metadata: this.metadata,
      }),
    ];
  }

  private endAssistantText(): AgUiEventRecord[] {
    if (!this.activeMessageId) {
      return [];
    }
    const messageId = this.activeMessageId;
    this.activeMessageId = null;
    return [
      this.validate({
        type: EventType.TEXT_MESSAGE_END,
        messageId,
        metadata: this.metadata,
      }),
    ];
  }

  private mapTurnDone(raw: Record<string, unknown>): AgUiEventRecord[] {
    const events = this.endAssistantText();
    const outcome = evaluateTurnDoneOutcome(raw);
    if (outcome.kind === "required_actions") {
      const requiredActions = extractRequiredActionInterruptRefs(raw);
      const interrupts =
        requiredActions.length > 0
          ? requiredActions.map((action) => ({
              id: action.id,
              reason:
                action.reason ??
                (outcome.runStepState === "awaiting_approval"
                  ? "approval_required"
                  : "input_required"),
              message: "Additional human action is required before this turn can continue.",
              metadata: this.metadata,
            }))
          : [
              {
                id: opaqueMessageId("int_req"),
                reason:
                  outcome.runStepState === "awaiting_approval"
                    ? "approval_required"
                    : "input_required",
                message: "Additional human action is required before this turn can continue.",
                metadata: this.metadata,
              },
            ];
      events.push(
        this.validate({
          type: EventType.RUN_FINISHED,
          threadId: this.context.logicalThreadId,
          runId: this.context.aguiRunId,
          outcome: {
            type: "interrupt",
            interrupts,
          },
          metadata: this.metadata,
        }),
      );
    } else {
      events.push(
        this.validate({
          type: EventType.RUN_FINISHED,
          threadId: this.context.logicalThreadId,
          runId: this.context.aguiRunId,
          outcome: { type: "success" },
          metadata: this.metadata,
        }),
      );
    }
    this.finished = true;
    return events;
  }

  private mapRunError(_raw: Record<string, unknown>): AgUiEventRecord[] {
    return this.buildRunError("TrueForge run failed.");
  }

  buildRunError(message: string): AgUiEventRecord[] {
    if (this.finished) {
      return [];
    }
    const events = this.endAssistantText();
    events.push(
      this.validate({
        type: EventType.RUN_ERROR,
        threadId: this.context.logicalThreadId,
        runId: this.context.aguiRunId,
        message,
        metadata: this.metadata,
      }),
    );
    this.finished = true;
    return events;
  }

  private mapUnsupportedCapabilityActivity(type: string, summary: string): AgUiEventRecord[] {
    const messageId = opaqueMessageId("act_unsup");
    return [
      this.validate({
        type: EventType.ACTIVITY_SNAPSHOT,
        messageId,
        activityType: "forgeroom.coworker_work.v1",
        content: {
          phase: "unsupported_capability",
          summary,
          capability: type,
        },
        metadata: this.metadata,
      }),
    ];
  }

  private validate(event: AgUiEventRecord): AgUiEventRecord {
    const parsed = parseUpstreamAgUiEvent(event);
    if (!parsed.ok) {
      throw new Error(`invalid outbound AG-UI event: ${parsed.capability}`);
    }
    return EventSchemas.parse(parsed.event) as AgUiEventRecord;
  }
}

export async function pollTrueForgeTurnEvents(input: {
  listEvents: (sessionId: string, turnId: string) => Promise<Array<Record<string, unknown>>>;
  sessionId: string;
  turnId: string;
  adapter: TrueForgeAGUIAdapter;
  onUpstreamEvent?: (event: Record<string, unknown>) => Promise<void>;
  onEvent?: (event: AgUiEventRecord) => Promise<void>;
  intervalMs?: number;
  timeoutMs?: number;
}): Promise<AgUiEventRecord[]> {
  const intervalMs = input.intervalMs ?? 100;
  const startedAt = Date.now();
  const emitted: AgUiEventRecord[] = [];
  const seenTrueForgeEventIds = new Set<string>();

  while (input.timeoutMs === undefined || Date.now() - startedAt < input.timeoutMs) {
    const events = await input.listEvents(input.sessionId, input.turnId);
    for (const raw of events) {
      const type = readString(raw.type) ?? "unknown";
      if (shouldDiscardTrueForgeEventType(type)) {
        continue;
      }
      let trueforgeEventId: string;
      try {
        trueforgeEventId = normalizeTrueForgeEvent(raw).trueforgeEventId;
      } catch {
        continue;
      }
      if (seenTrueForgeEventIds.has(trueforgeEventId)) {
        continue;
      }
      seenTrueForgeEventIds.add(trueforgeEventId);
      await input.onUpstreamEvent?.(raw);

      const mapped = input.adapter.mapTrueForgeEvent(raw);
      for (const event of mapped) {
        emitted.push(event);
        await input.onEvent?.(event);
        if (event.type === EventType.RUN_FINISHED || event.type === EventType.RUN_ERROR) {
          return emitted;
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return emitted;
}
