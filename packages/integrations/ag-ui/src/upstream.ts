import { EventSchemas, RunAgentInputSchema, type RunAgentInput } from "@ag-ui/core";
import { isP0UnsupportedCapability, unsupportedCapability } from "@forgeroom/contracts";

export type ParsedRunAgentInput = {
  ok: true;
  input: RunAgentInput;
};

export type UpstreamParseFailure = {
  ok: false;
  capability: string;
  reason: "unsupported_in_p0" | "invalid_upstream_schema" | "owned_by_P0-211";
  issues?: string[];
};

export function parseUpstreamRunAgentInput(
  input: unknown,
): ParsedRunAgentInput | UpstreamParseFailure {
  if (input && typeof input === "object" && "resume" in input) {
    const resume = (input as { resume?: unknown }).resume;
    if (Array.isArray(resume) && resume.length > 0) {
      return unsupportedCapability("RunAgentInput.resume", "unsupported_in_p0");
    }
  }
  const parsed = RunAgentInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      capability: "RunAgentInput",
      reason: "invalid_upstream_schema",
      issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    };
  }
  if (parsed.data.resume && parsed.data.resume.length > 0) {
    return unsupportedCapability("RunAgentInput.resume", "unsupported_in_p0");
  }
  return { ok: true, input: parsed.data };
}

export type ParsedAgUiEvent = {
  ok: true;
  event: ReturnType<typeof EventSchemas.parse>;
};

export function parseUpstreamAgUiEvent(input: unknown): ParsedAgUiEvent | UpstreamParseFailure {
  if (!input || typeof input !== "object") {
    return {
      ok: false,
      capability: "upstream_ag_ui_schema",
      reason: "invalid_upstream_schema",
      issues: ["event must be an object"],
    };
  }
  const type =
    "type" in input && typeof (input as { type?: unknown }).type === "string"
      ? (input as { type: string }).type
      : "unknown";
  if (isP0UnsupportedCapability(type) || type === "RAW") {
    return unsupportedCapability(type, "unsupported_in_p0");
  }
  const parsed = EventSchemas.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      capability: "upstream_ag_ui_schema",
      reason: "invalid_upstream_schema",
      issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    };
  }
  return { ok: true, event: parsed.data };
}

export function extractLatestUserMessageContent(input: RunAgentInput): string | null {
  for (let index = input.messages.length - 1; index >= 0; index -= 1) {
    const message = input.messages[index];
    if (!message || message.role !== "user") {
      continue;
    }
    if (typeof message.content === "string" && message.content.trim().length > 0) {
      return message.content.trim();
    }
  }
  return null;
}
