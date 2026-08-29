import {
  buildSkillDraftBody,
  mergeSkillDraftNarrative,
  parseSkillDraftMarkdown,
  type SkillDraftBody,
  type SkillRunEvidence,
} from "@forgeroom/domain";
import { compileP0AgentSpec } from "@forgeroom/trueforge";
import type { TrueForgeClient, TrueForgeTurn, TrueForgeTurnEvent } from "@forgeroom/trueforge";

const DEFAULT_MODEL_PRESET = "openai/gpt-5-4-mini";
const TURN_POLL_INTERVAL_MS = 250;
const TURN_POLL_TIMEOUT_MS = 120_000;

const FORBIDDEN_DRAFT_EVENT_PREFIXES = ["tool.", "mcp.", "composio."] as const;

export type SkillDraftTurnDeps = {
  client: Pick<TrueForgeClient, "createSession" | "createTurn" | "getTurn" | "listTurnEvents">;
  modelPreset?: string;
  now?: () => Date;
};

export class SkillDraftTurnError extends Error {
  readonly code:
    | "draft_turn_failed"
    | "draft_turn_timeout"
    | "draft_turn_external_tool"
    | "draft_turn_unparseable";

  constructor(
    code:
      | "draft_turn_failed"
      | "draft_turn_timeout"
      | "draft_turn_external_tool"
      | "draft_turn_unparseable",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "SkillDraftTurnError";
    this.code = code;
  }
}

function buildSkillDraftPrompt(evidence: SkillRunEvidence): string {
  const redacted = {
    goal: evidence.goal,
    source_message: evidence.sourceMessageBody,
    steps: evidence.steps
      .filter((step) => evidence.sourceStepIds.includes(step.id))
      .map((step) => ({ id: step.id, objective: step.objective, state: step.state })),
    events: evidence.events.map((event) => ({
      type: event.normalizedType,
      payload: event.payloadRedacted,
    })),
    artifacts: evidence.artifacts,
    tasks: evidence.tasks,
    approvals: evidence.approvals,
  };
  return [
    "You are drafting an instruction-only private skill from a completed application run.",
    "Return Markdown only with these sections: When to use, Inputs, Method, Validation, Output, Failures.",
    "Do not call tools, request credentials, or invent required tools/components.",
    "Use only the redacted evidence below.",
    "",
    "```json",
    JSON.stringify(redacted, null, 2),
    "```",
  ].join("\n");
}

function extractTurnMarkdown(turn: TrueForgeTurn, events: readonly TrueForgeTurnEvent[]): string {
  const output = turn.state.output;
  if (typeof output === "string" && output.trim().length > 0) {
    return output;
  }
  if (output && typeof output === "object" && !Array.isArray(output)) {
    const record = output as Record<string, unknown>;
    const text = record.text ?? record.content ?? record.markdown;
    if (typeof text === "string" && text.trim().length > 0) {
      return text;
    }
  }
  for (const event of events) {
    const type = typeof event.type === "string" ? event.type : "";
    if (type.includes("assistant") || type.includes("message")) {
      const content = event.content ?? event.text ?? event.message;
      if (typeof content === "string" && content.trim().length > 0) {
        return content;
      }
    }
  }
  throw new SkillDraftTurnError("draft_turn_unparseable");
}

function assertNoExternalDraftEvents(events: readonly TrueForgeTurnEvent[]): void {
  for (const event of events) {
    const type = typeof event.type === "string" ? event.type.toLowerCase() : "";
    if (FORBIDDEN_DRAFT_EVENT_PREFIXES.some((prefix) => type.startsWith(prefix))) {
      throw new SkillDraftTurnError(
        "draft_turn_external_tool",
        `Skill drafting turn emitted forbidden event type: ${event.type}`,
      );
    }
  }
}

async function waitForTurnDone(
  client: SkillDraftTurnDeps["client"],
  sessionId: string,
  turnId: string,
): Promise<TrueForgeTurn> {
  const deadline = Date.now() + TURN_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const turn = await client.getTurn(sessionId, turnId);
    const status = turn.state.status?.toLowerCase() ?? "";
    if (status === "done" || status === "completed") {
      return turn;
    }
    if (status === "failed" || status === "cancelled" || status === "canceled") {
      throw new SkillDraftTurnError("draft_turn_failed", `Drafting turn ended in ${status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, TURN_POLL_INTERVAL_MS));
  }
  throw new SkillDraftTurnError("draft_turn_timeout");
}

export function compileInstructionOnlyDraftAgentSpec(modelPreset: string) {
  return compileP0AgentSpec({
    modelPreset,
    sandboxEnabled: false,
    connectors: [],
    skillNames: [],
    instructions:
      "Draft instruction-only Markdown skills from redacted run evidence. Never call tools or request credentials.",
  });
}

export async function buildSkillDraftBodyFromTurn(
  evidence: SkillRunEvidence,
  deps: SkillDraftTurnDeps,
): Promise<SkillDraftBody> {
  const modelPreset = deps.modelPreset ?? DEFAULT_MODEL_PRESET;
  const spec = compileInstructionOnlyDraftAgentSpec(modelPreset);
  const session = await deps.client.createSession({ spec });
  const created = await deps.client.createTurn(session.id, {
    input: [{ type: "user.message", content: buildSkillDraftPrompt(evidence) }],
    previousTurnId: "none",
    stream: false,
  });
  const turn = await waitForTurnDone(deps.client, session.id, created.id);
  const events = await deps.client.listTurnEvents(session.id, created.id);
  assertNoExternalDraftEvents(events);
  const markdown = extractTurnMarkdown(turn, events);
  const narrative = parseSkillDraftMarkdown(markdown);
  return mergeSkillDraftNarrative(narrative, evidence);
}

export function buildSkillDraftBodyForCreate(
  evidence: SkillRunEvidence,
  deps?: SkillDraftTurnDeps,
): Promise<SkillDraftBody> {
  if (deps) {
    return buildSkillDraftBodyFromTurn(evidence, deps);
  }
  return Promise.resolve(buildSkillDraftBody(evidence));
}
