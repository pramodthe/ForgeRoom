import { EventSchemas, RunAgentInputSchema, type RunAgentInput } from "@ag-ui/core";
import { isP0UnsupportedCapability, unsupportedCapability } from "@forgeroom/contracts";
import { z } from "zod";

const existingRunBindingSchema = z
  .object({
    schemaVersion: z.literal(1),
    sourceMessageId: z.string().min(1),
    applicationRunId: z.string().min(1),
    runStepId: z.string().min(1),
  })
  .strict();

export type ExistingRunBinding = z.infer<typeof existingRunBindingSchema>;

export type ParsedRunAgentInput = {
  ok: true;
  input: RunAgentInput;
  /** When true, callers must authorize via PauseGroup CAS service before any provider call. */
  resumeRequiresPauseGroupService?: true;
};

export type UpstreamParseFailure = {
  ok: false;
  capability: string;
  reason:
    | "unsupported_in_p0"
    | "invalid_upstream_schema"
    | "owned_by_P0-211"
    | "requires_pause_group_service";
  issues?: string[];
};

export function parseUpstreamRunAgentInput(
  input: unknown,
): ParsedRunAgentInput | UpstreamParseFailure {
  const parsed = RunAgentInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      capability: "RunAgentInput",
      reason: "invalid_upstream_schema",
      issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    };
  }
  // Resume arrays are accepted at the schema boundary only; authorization and
  // CAS/idempotency must go through the PauseGroup service (P0-308). Direct
  // forged payloads are rejected there — never treated as decisions here.
  if (parsed.data.resume && parsed.data.resume.length > 0) {
    return {
      ok: true,
      input: parsed.data,
      resumeRequiresPauseGroupService: true,
    };
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

export function extractExistingRunBinding(input: RunAgentInput): ExistingRunBinding | null {
  if (!input.forwardedProps || typeof input.forwardedProps !== "object") {
    return null;
  }
  const parsed = existingRunBindingSchema.safeParse(
    (input.forwardedProps as { forgeroomV1?: unknown }).forgeroomV1,
  );
  return parsed.success ? parsed.data : null;
}
