import { createHash } from "node:crypto";
import type { PreviousTurnIdInput, TrueForgeTurn, TurnInputItem } from "@forgeroom/trueforge";
import { canonicalizeJson } from "@forgeroom/domain";
import { hashTurnCreateIntent } from "./turn-creation";
import { assertResponseOnlyNoNormalMessage } from "./pause-resume";

export type ComponentContinuationResponse = {
  interruptId: string;
  toolCallId: string;
  threadId: string;
  resultRedacted: unknown;
};

export type BuildComponentContinuationTurnInputArgs = {
  applicationRunToken: string;
  previousTrueforgeTurnId: string;
  response: ComponentContinuationResponse;
};

export type ComponentContinuationTurnCreateDecision =
  | { action: "bind_existing"; turn: TrueForgeTurn; matchedBy: "input_hash" }
  | { action: "create_new" }
  | { action: "fail_closed"; reason: "ambiguous_history" };

/** Build a response-only TrueForge turn that delivers one bounded component interaction result. */
export function buildComponentContinuationTurnInput(
  args: BuildComponentContinuationTurnInputArgs,
): {
  input: TurnInputItem[];
  previousTurnId: PreviousTurnIdInput;
  inputHash: string;
  responsePayloadHash: string;
  redactedSummary: Record<string, unknown>;
} {
  const content = canonicalizeJson(args.response.resultRedacted);
  const input: TurnInputItem[] = [
    {
      type: "user.tool_response",
      thread_id: args.response.threadId,
      tool_call_id: args.response.toolCallId,
      content,
    },
  ];
  assertResponseOnlyNoNormalMessage(input);

  const previousTurnId: PreviousTurnIdInput = args.previousTrueforgeTurnId;
  const inputHash = hashTurnCreateIntent({ input, previousTurnId });
  const responsePayloadHash = hashCanonicalPayload({
    application_run_token: args.applicationRunToken,
    previous_turn_id: previousTurnId,
    interrupt_id: args.response.interruptId,
    tool_call_id: args.response.toolCallId,
    thread_id: args.response.threadId,
    result_hash: hashJson(args.response.resultRedacted),
    input,
  });

  return {
    input,
    previousTurnId,
    inputHash,
    responsePayloadHash,
    redactedSummary: {
      kind: "component_interaction_response",
      interrupt_id: args.response.interruptId,
      tool_call_id: args.response.toolCallId,
      thread_id: args.response.threadId,
      result_hash: hashJson(args.response.resultRedacted),
    },
  };
}

export function decideCreateOrReconcileComponentContinuationTurn(args: {
  localTrueforgeTurnId: string | null;
  history: TrueForgeTurn[];
  inputHash: string;
  previousTurnId: PreviousTurnIdInput;
}): ComponentContinuationTurnCreateDecision {
  const expectedPrevious = args.previousTurnId === "none" ? null : args.previousTurnId;
  const matches = args.history.filter((turn) => {
    if (turn.previous_turn_id !== expectedPrevious) {
      return false;
    }
    const hash = hashTurnCreateIntent({
      input: turn.input ?? [],
      previousTurnId: turn.previous_turn_id === null ? "none" : turn.previous_turn_id,
    });
    return hash === args.inputHash;
  });

  if (matches.length > 1) {
    return { action: "fail_closed", reason: "ambiguous_history" };
  }
  if (matches.length === 1) {
    if (args.localTrueforgeTurnId && matches[0]!.id !== args.localTrueforgeTurnId) {
      return { action: "fail_closed", reason: "ambiguous_history" };
    }
    return { action: "bind_existing", turn: matches[0]!, matchedBy: "input_hash" };
  }
  if (args.localTrueforgeTurnId) {
    return { action: "fail_closed", reason: "ambiguous_history" };
  }
  return { action: "create_new" };
}

function hashJson(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalizeJson(value)).digest("hex")}`;
}

function hashCanonicalPayload(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalizeJson(value)).digest("hex")}`;
}
