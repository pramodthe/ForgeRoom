import { createHash } from "node:crypto";
import type { PreviousTurnIdInput, TrueForgeTurn, TurnInputItem } from "@forgeroom/trueforge";

export type BuildNormalTurnInputArgs = {
  applicationRunToken: string;
  content: string;
  previousTrueforgeTurnId: string | null;
};

/**
 * Deterministic create payload. The application run token is embedded as a
 * stable marker line so history reconciliation can match without a TrueForge field.
 */
export function buildNormalTurnInput(args: BuildNormalTurnInputArgs): {
  input: TurnInputItem[];
  previousTurnId: PreviousTurnIdInput;
  inputHash: string;
} {
  const content = `[[forgeroom:application_run_token=${args.applicationRunToken}]]\n${args.content}`;
  const input: TurnInputItem[] = [{ type: "user.message", content }];
  const previousTurnId: PreviousTurnIdInput = args.previousTrueforgeTurnId ?? "none";
  return {
    input,
    previousTurnId,
    inputHash: hashTurnCreateIntent({ input, previousTurnId }),
  };
}

export function hashTurnCreateIntent(input: {
  input: TurnInputItem[];
  previousTurnId: PreviousTurnIdInput;
}): string {
  const digest = createHash("sha256")
    .update(stableStringify({ input: input.input, previous_turn_id: input.previousTurnId }))
    .digest("hex");
  return `sha256:${digest}`;
}

export function extractApplicationRunTokenFromInput(input: TurnInputItem[]): string | null {
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    if ((item as { type?: unknown }).type !== "user.message") continue;
    const content = (item as { content?: unknown }).content;
    if (typeof content !== "string") continue;
    const match = content.match(/\[\[forgeroom:application_run_token=([^\]]+)\]\]/);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

export type HistoryMatch = {
  turn: TrueForgeTurn;
  matchedBy: "application_run_token" | "input_hash";
};

/** Prefer application token match; fall back to predecessor + input hash. */
export function matchTurnFromHistory(args: {
  turns: TrueForgeTurn[];
  applicationRunToken: string;
  inputHash: string;
  previousTurnId: PreviousTurnIdInput;
}): HistoryMatch | null {
  const expectedPrevious = args.previousTurnId === "none" ? null : args.previousTurnId;

  for (const turn of args.turns) {
    const previous = turn.previous_turn_id;
    if (previous !== expectedPrevious) {
      continue;
    }
    const token = extractApplicationRunTokenFromInput(turn.input ?? []);
    if (token === args.applicationRunToken) {
      return { turn, matchedBy: "application_run_token" };
    }
    const hash = hashTurnCreateIntent({
      input: turn.input ?? [],
      previousTurnId: previous === null ? "none" : previous,
    });
    if (hash === args.inputHash) {
      return { turn, matchedBy: "input_hash" };
    }
  }
  return null;
}

export type CreateOrReconcileDecision =
  | { action: "bind_existing"; turn: TrueForgeTurn; matchedBy: HistoryMatch["matchedBy"] }
  | { action: "create_new" }
  | { action: "fail_closed"; reason: "ambiguous_history" };

/**
 * Uncertain creates must query history before any new create.
 * Multiple matches fail closed (never blind-create a cancelling second turn).
 */
export function decideCreateOrReconcile(args: {
  localTrueforgeTurnId: string | null;
  history: TrueForgeTurn[];
  applicationRunToken: string;
  inputHash: string;
  previousTurnId: PreviousTurnIdInput;
}): CreateOrReconcileDecision {
  if (args.localTrueforgeTurnId) {
    const existing = args.history.find((turn) => turn.id === args.localTrueforgeTurnId);
    if (existing) {
      return { action: "bind_existing", turn: existing, matchedBy: "application_run_token" };
    }
  }

  const matches = args.history.filter((turn) => {
    const previous = turn.previous_turn_id;
    const expectedPrevious = args.previousTurnId === "none" ? null : args.previousTurnId;
    if (previous !== expectedPrevious) {
      return false;
    }
    const token = extractApplicationRunTokenFromInput(turn.input ?? []);
    if (token === args.applicationRunToken) {
      return true;
    }
    const hash = hashTurnCreateIntent({
      input: turn.input ?? [],
      previousTurnId: previous === null ? "none" : previous,
    });
    return hash === args.inputHash;
  });

  if (matches.length > 1) {
    return { action: "fail_closed", reason: "ambiguous_history" };
  }
  if (matches.length === 1) {
    const matched = matchTurnFromHistory({
      turns: matches,
      applicationRunToken: args.applicationRunToken,
      inputHash: args.inputHash,
      previousTurnId: args.previousTurnId,
    });
    if (!matched) {
      return { action: "fail_closed", reason: "ambiguous_history" };
    }
    return { action: "bind_existing", turn: matched.turn, matchedBy: matched.matchedBy };
  }
  return { action: "create_new" };
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
}
