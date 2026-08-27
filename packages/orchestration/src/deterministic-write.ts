import type { TrueForgeClient, TrueForgeTurnEvent } from "@forgeroom/trueforge";
import {
  assertNoRawOrCredentials,
  extractDirectToolObservationFromTrueForgeEvents,
  projectBlockedConnectionEvent,
  type ProjectedToolActivityEvent,
  type TrueForgeDirectToolObservation,
} from "./real-read";

/**
 * Application write activity events for the channel timeline.
 * Only policy-approved safe fields — never raw tool bodies or credentials.
 */
export type SafeWriteSummary = {
  coworkerId: string;
  toolName: string;
  connectorName: string;
  accountSuffix: string;
  riskClass: "write";
  target: Record<string, unknown>;
  redactedArguments: Record<string, unknown>;
  resultSummary: string;
  receipt: Record<string, unknown> | null;
  receiptClaim: "verified_provider_receipt" | "labeled_safe_result" | "none";
  rawResultObserved: boolean;
  rawResultByteLength: number | null;
};

export type DeterministicWritePreflightAdapterResult =
  | {
      ok: true;
      blocksDispatch: false;
      toolSlug: string;
      accountSuffix: string;
      connectorName: string;
      descriptorHash: string;
      inApprovalRequiredSet: true;
    }
  | {
      ok: false;
      blocksDispatch: true;
      reason: string;
      runStepState: "blocked_connection" | null;
      accountSuffix: string;
      toolSlug: string;
    };

export type WriteBindingFreshnessAdapterResult =
  | { fresh: true; requireNewProposal: false }
  | {
      fresh: false;
      requireNewProposal: true;
      reason: "stale_proposal";
      changedFields: string[];
    };

export type WriteExecutionGateAdapterResult =
  | {
      allowExecute: false;
      reason: string;
      providerCalls: 0;
      proposalState: string;
      createsResumeIntent: false;
    }
  | {
      allowExecute: true;
      reason: "approved";
      providerCalls: 0;
      proposalState: "allowed";
      createsResumeIntent: true;
    };

export type WriteProviderOutcomeAdapterResult = {
  proposalState: "succeeded" | "failed" | "unknown";
  automaticRetry: false;
  timedOut: boolean;
};

export type WriteReconciliationAdapterResult = {
  finalState: "reconciled_succeeded" | "reconciled_failed";
  matched: boolean;
  observedLabels: string[] | null;
  verifiedReceipt: Record<string, unknown> | null;
};

export type ApplicationResumeIntentAdapterResult = {
  kind: "pause_resume";
  pauseGroupId: string;
  proposalId: string;
  requiredActionId: string;
  decision: "allow";
  oneIntent: true;
  automaticRetry: false;
};

export type DeterministicWriteDispatchAdapters = {
  assertApprovalRequired: () => void;
  preflight: () =>
    | DeterministicWritePreflightAdapterResult
    | Promise<DeterministicWritePreflightAdapterResult>;
  evaluateBindings: () => WriteBindingFreshnessAdapterResult;
  gateExecution: (input: {
    bindingsFresh: boolean;
    preflightOk: boolean;
  }) => WriteExecutionGateAdapterResult;
  planResumeIntent: () => ApplicationResumeIntentAdapterResult;
  /**
   * Invoke the write only after exact approval + one resume intent.
   * Must observe the literal write tool (reject meta wrappers).
   */
  invokeWriteViaTrueForge: () =>
    | TrueForgeDirectToolObservation
    | Promise<TrueForgeDirectToolObservation>;
  assertDirectWriteTool: (observedToolName: string) => void;
  classifyProviderOutcome: (input: {
    observation: TrueForgeDirectToolObservation;
    timedOut?: boolean;
  }) => WriteProviderOutcomeAdapterResult;
  /**
   * Perform the reviewed allowlisted reconciliation read.
   * Must never re-issue the write tool.
   */
  reconcileViaRead: () =>
    | WriteReconciliationAdapterResult
    | Promise<WriteReconciliationAdapterResult>;
  buildSafeSummary: (input: {
    coworkerId: string;
    accountSuffix: string;
    arguments: unknown;
    rawResult: unknown;
  }) => SafeWriteSummary;
  isAuthFailure?: (raw: unknown) => boolean;
};

export type DeterministicWriteDispatchInput = {
  coworkerId: string;
  channelId: string;
  runId: string;
  agentTurnId: string;
  pauseGroupId: string;
  proposalId: string;
};

export type DeterministicWriteDispatchResult =
  | {
      ok: true;
      kind: "reconciled_succeeded" | "succeeded";
      events: ProjectedToolActivityEvent[];
      summary: SafeWriteSummary;
      resumeIntent: ApplicationResumeIntentAdapterResult;
      proposalState: "succeeded" | "reconciled_succeeded";
      providerCalls: 1;
      automaticRetry: false;
      trueforgeTurnId: string;
      observedToolName: string;
    }
  | {
      ok: false;
      kind:
        | "denied"
        | "stale_proposal"
        | "not_approved"
        | "preflight_blocked"
        | "blocked_connection"
        | "meta_tool_rejected"
        | "tool_failed"
        | "unknown_pending_reconcile"
        | "reconciled_failed";
      events: ProjectedToolActivityEvent[];
      reason: string;
      providerCalls: 0 | 1;
      automaticRetry: false;
      proposalState: string;
      resumeIntent: ApplicationResumeIntentAdapterResult | null;
      runStepState: "blocked_connection" | null;
    };

/**
 * Project safe attributed tool.started / tool.succeeded|failed for the deterministic write.
 */
export function projectSafeWriteToolEvents(input: {
  summary: SafeWriteSummary;
  outcome: "succeeded" | "failed" | "unknown";
  toolCallId: string;
  channelId: string;
  runId: string;
  agentTurnId: string;
  proposalState: string;
}): ProjectedToolActivityEvent[] {
  const request = {
    coworker_id: input.summary.coworkerId,
    tool_name: input.summary.toolName,
    connector_name: input.summary.connectorName,
    account_suffix: input.summary.accountSuffix,
    risk_class: input.summary.riskClass,
    target: input.summary.target,
    redacted_arguments: input.summary.redactedArguments,
    channel_id: input.channelId,
    run_id: input.runId,
    agent_turn_id: input.agentTurnId,
    tool_call_id: input.toolCallId,
    proposal_state: input.proposalState,
  };

  const started: ProjectedToolActivityEvent = {
    normalizedType: "tool.started",
    payloadRedacted: {
      type: "tool.started",
      ...request,
    },
  };

  const terminalType =
    input.outcome === "succeeded"
      ? "tool.succeeded"
      : input.outcome === "failed"
        ? "tool.failed"
        : "tool.failed";

  // Only claim verified_provider_receipt when the summary says the adapter verified it.
  const receipt =
    input.summary.receiptClaim === "verified_provider_receipt" ? input.summary.receipt : null;

  const terminal: ProjectedToolActivityEvent = {
    normalizedType: terminalType,
    payloadRedacted: {
      type: terminalType,
      ...request,
      result_summary: input.summary.resultSummary,
      receipt,
      receipt_claim: input.summary.receiptClaim,
      raw_result_observed: input.summary.rawResultObserved,
      raw_result_byte_length: input.summary.rawResultByteLength,
      automatic_retry: false,
    },
  };

  assertNoRawOrCredentials(started.payloadRedacted);
  assertNoRawOrCredentials(terminal.payloadRedacted);
  return [started, terminal];
}

/**
 * Approval-gated deterministic write:
 * preflight → binding freshness → exact approval → one resume intent →
 * direct write (no blind retry) → reconcile read → final state.
 */
export async function dispatchApprovalGatedDeterministicWrite(
  adapters: DeterministicWriteDispatchAdapters,
  input: DeterministicWriteDispatchInput,
): Promise<DeterministicWriteDispatchResult> {
  try {
    adapters.assertApprovalRequired();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      kind: "preflight_blocked",
      events: [],
      reason: message,
      providerCalls: 0,
      automaticRetry: false,
      proposalState: "proposed",
      resumeIntent: null,
      runStepState: null,
    };
  }

  const preflight = await adapters.preflight();
  if (!preflight.ok) {
    const events: ProjectedToolActivityEvent[] = [];
    if (preflight.runStepState === "blocked_connection") {
      events.push(
        projectBlockedConnectionEvent({
          coworkerId: input.coworkerId,
          accountSuffix: preflight.accountSuffix,
          toolSlug: preflight.toolSlug,
          reason: preflight.reason,
          channelId: input.channelId,
          runId: input.runId,
          agentTurnId: input.agentTurnId,
        }),
      );
    }
    return {
      ok: false,
      kind:
        preflight.runStepState === "blocked_connection"
          ? "blocked_connection"
          : "preflight_blocked",
      events,
      reason: preflight.reason,
      providerCalls: 0,
      automaticRetry: false,
      proposalState: "proposed",
      resumeIntent: null,
      runStepState: preflight.runStepState,
    };
  }

  const freshness = adapters.evaluateBindings();
  const gate = adapters.gateExecution({
    bindingsFresh: freshness.fresh,
    preflightOk: true,
  });

  if (!gate.allowExecute) {
    const kind =
      gate.reason === "denied"
        ? "denied"
        : gate.reason === "stale_proposal"
          ? "stale_proposal"
          : gate.reason === "not_approved"
            ? "not_approved"
            : "preflight_blocked";
    return {
      ok: false,
      kind,
      events: [],
      reason: gate.reason,
      providerCalls: 0,
      automaticRetry: false,
      proposalState: gate.proposalState,
      resumeIntent: null,
      runStepState: null,
    };
  }

  // Exact approval → exactly one application resume intent before any provider write.
  const resumeIntent = adapters.planResumeIntent();
  if (!resumeIntent.oneIntent || resumeIntent.automaticRetry !== false) {
    return {
      ok: false,
      kind: "preflight_blocked",
      events: [],
      reason: "resume_intent_invariant",
      providerCalls: 0,
      automaticRetry: false,
      proposalState: "allowed",
      resumeIntent: null,
      runStepState: null,
    };
  }

  let observation: TrueForgeDirectToolObservation;
  try {
    observation = await adapters.invokeWriteViaTrueForge();
    adapters.assertDirectWriteTool(observation.observedToolName);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const meta = /meta-tool|forbidden|COMPOSIO_/i.test(message);
    return {
      ok: false,
      kind: meta ? "meta_tool_rejected" : "tool_failed",
      events: [],
      reason: message,
      providerCalls: 0,
      automaticRetry: false,
      proposalState: "allowed",
      resumeIntent,
      runStepState: null,
    };
  }

  if (adapters.isAuthFailure?.(observation.rawResult)) {
    const blocked = projectBlockedConnectionEvent({
      coworkerId: input.coworkerId,
      accountSuffix: preflight.accountSuffix,
      toolSlug: preflight.toolSlug,
      reason: "expired_account",
      channelId: input.channelId,
      runId: input.runId,
      agentTurnId: input.agentTurnId,
    });
    return {
      ok: false,
      kind: "blocked_connection",
      events: [blocked],
      reason: "expired_account",
      providerCalls: 1,
      automaticRetry: false,
      proposalState: "unknown",
      resumeIntent,
      runStepState: "blocked_connection",
    };
  }

  const outcome = adapters.classifyProviderOutcome({ observation });
  if (outcome.automaticRetry !== false) {
    return {
      ok: false,
      kind: "tool_failed",
      events: [],
      reason: "automatic_retry_forbidden",
      providerCalls: 1,
      automaticRetry: false,
      proposalState: "unknown",
      resumeIntent,
      runStepState: null,
    };
  }

  const summary = adapters.buildSafeSummary({
    coworkerId: input.coworkerId,
    accountSuffix: preflight.accountSuffix,
    arguments: observation.arguments,
    rawResult: observation.rawResult,
  });
  assertNoRawOrCredentials(summary.redactedArguments);
  assertNoRawOrCredentials(summary.target);

  // Ambiguous / timeout → unknown; reconcile via reviewed read without blind write retry.
  if (outcome.proposalState === "unknown") {
    const reconciled = await adapters.reconcileViaRead();
    const events = projectSafeWriteToolEvents({
      summary: {
        ...summary,
        receipt:
          reconciled.verifiedReceipt && summary.receiptClaim === "verified_provider_receipt"
            ? reconciled.verifiedReceipt
            : summary.receiptClaim === "verified_provider_receipt"
              ? summary.receipt
              : null,
        resultSummary:
          reconciled.finalState === "reconciled_succeeded"
            ? `Reconciled succeeded for ${String(summary.target.display ?? summary.toolName)}`
            : `Reconciled failed for ${String(summary.target.display ?? summary.toolName)}`,
      },
      outcome: reconciled.matched ? "succeeded" : "failed",
      toolCallId: observation.toolCallId,
      channelId: input.channelId,
      runId: input.runId,
      agentTurnId: input.agentTurnId,
      proposalState: reconciled.finalState,
    });

    if (reconciled.finalState === "reconciled_succeeded") {
      return {
        ok: true,
        kind: "reconciled_succeeded",
        events,
        summary: {
          ...summary,
          receipt:
            summary.receiptClaim === "verified_provider_receipt" ? summary.receipt : null,
          resultSummary: events[1]!.payloadRedacted.result_summary as string,
        },
        resumeIntent,
        proposalState: "reconciled_succeeded",
        providerCalls: 1,
        automaticRetry: false,
        trueforgeTurnId: observation.trueforgeTurnId,
        observedToolName: observation.observedToolName,
      };
    }

    return {
      ok: false,
      kind: "reconciled_failed",
      events,
      reason: "reconciliation_mismatch",
      providerCalls: 1,
      automaticRetry: false,
      proposalState: "reconciled_failed",
      resumeIntent,
      runStepState: null,
    };
  }

  // Clear provider success still gets a reconcile read for the demo write proof.
  const reconciled = await adapters.reconcileViaRead();
  const events = projectSafeWriteToolEvents({
    summary: {
      ...summary,
      receipt: summary.receiptClaim === "verified_provider_receipt" ? summary.receipt : null,
    },
    outcome:
      reconciled.finalState === "reconciled_succeeded"
        ? "succeeded"
        : outcome.proposalState === "failed"
          ? "failed"
          : "failed",
    toolCallId: observation.toolCallId,
    channelId: input.channelId,
    runId: input.runId,
    agentTurnId: input.agentTurnId,
    proposalState: reconciled.finalState,
  });

  if (reconciled.finalState === "reconciled_succeeded") {
    return {
      ok: true,
      kind: "reconciled_succeeded",
      events,
      summary: {
        ...summary,
        receipt: summary.receiptClaim === "verified_provider_receipt" ? summary.receipt : null,
      },
      resumeIntent,
      proposalState: "reconciled_succeeded",
      providerCalls: 1,
      automaticRetry: false,
      trueforgeTurnId: observation.trueforgeTurnId,
      observedToolName: observation.observedToolName,
    };
  }

  return {
    ok: false,
    kind: "reconciled_failed",
    events,
    reason:
      outcome.proposalState === "failed" ? "provider_failed" : "reconciliation_mismatch",
    providerCalls: 1,
    automaticRetry: false,
    proposalState: "reconciled_failed",
    resumeIntent,
    runStepState: null,
  };
}

/**
 * Helper for probes: create a TrueForge turn then list events until the
 * direct write tool is observed (or timeout). Callers inject poll timing.
 */
export async function invokeDirectWriteViaTrueForgeTurn(input: {
  client: Pick<TrueForgeClient, "createTurn" | "listTurnEvents">;
  sessionId: string;
  previousTurnId: "none" | string;
  instruction: string;
  expectedToolName: string;
  pollEvents?: (sessionId: string, turnId: string) => Promise<TrueForgeTurnEvent[]>;
}): Promise<TrueForgeDirectToolObservation> {
  const turn = await input.client.createTurn(input.sessionId, {
    input: [{ type: "user.message", content: input.instruction }],
    previousTurnId: input.previousTurnId,
    stream: false,
  });
  const events =
    (await input.pollEvents?.(input.sessionId, turn.id)) ??
    (await input.client.listTurnEvents(input.sessionId, turn.id));
  const observation = extractDirectToolObservationFromTrueForgeEvents({
    turn,
    events,
    expectedToolName: input.expectedToolName,
  });
  if (!observation) {
    const names = events
      .map((event) => {
        if (!event || typeof event !== "object") return null;
        const row = event as Record<string, unknown>;
        return (
          (typeof row.tool_name === "string" && row.tool_name) ||
          (typeof row.toolName === "string" && row.toolName) ||
          (typeof row.name === "string" && row.name) ||
          null
        );
      })
      .filter((name): name is string => Boolean(name));
    throw new Error(
      `TrueForge turn ${turn.id} did not invoke direct tool ${input.expectedToolName}` +
        (names.length > 0 ? `; observed tools: ${names.join(", ")}` : ""),
    );
  }
  return observation;
}
