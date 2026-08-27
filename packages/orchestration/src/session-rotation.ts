import { renderInFlightMcpOutcome, type McpInFlightOutcome } from "./stop-correction";
import { isCapabilityRestriction } from "./capability-intersection";
import type { TurnQueueInputType } from "./turn-queue";

export type SessionRotationReason =
  | "grant_add"
  | "grant_remove"
  | "account_revoke"
  | "policy_tighten"
  | "component_grant"
  | "component_revoke"
  | "descriptor_drift"
  | "skill_attach"
  | "skill_detach"
  | "configuration_changed"
  | "reconnect";

export type SessionRotationPlan = {
  reason: SessionRotationReason;
  isRestriction: boolean;
  blockClaims: true;
  requestActiveTurnCancellation: boolean;
  staleUnresolvedActions: boolean;
  createNewSessionRevision: true;
  createNewTrueForgeSession: true;
  atomicSwapCurrentGeneration: true;
  rebindNormalQueueItems: true;
  migrateResponseIntents: false;
  retainOldGenerationForAudit: true;
  oldGenerationAcceptsNewWork: false;
  mcpInFlight: McpInFlightOutcome | null;
  affectedSessionScope: "coworker_sessions_only";
};

export type QueueItemRebindDecision =
  | { action: "rebind_to_current"; inputType: "normal" | "correction" }
  | { action: "never_migrate"; inputType: TurnQueueInputType; reason: "response_intent" };

/** Pure rotation plan before any TrueForge or DB mutation. */
export function planSessionRotation(input: {
  reason: SessionRotationReason;
  previousTools: readonly string[];
  nextTools: readonly string[];
  hasActiveTurn: boolean;
  mcpInFlightKnownTerminal: boolean | null;
}): SessionRotationPlan {
  const restrictionReasons: SessionRotationReason[] = [
    "grant_remove",
    "account_revoke",
    "policy_tighten",
    "component_revoke",
    "descriptor_drift",
  ];
  const isRestriction =
    restrictionReasons.includes(input.reason) ||
    isCapabilityRestriction(input.previousTools, input.nextTools);

  const mcpInFlight =
    input.mcpInFlightKnownTerminal === null
      ? null
      : renderInFlightMcpOutcome(input.mcpInFlightKnownTerminal);

  return {
    reason: input.reason,
    isRestriction,
    blockClaims: true,
    requestActiveTurnCancellation: isRestriction && input.hasActiveTurn,
    staleUnresolvedActions: isRestriction,
    createNewSessionRevision: true,
    createNewTrueForgeSession: true,
    atomicSwapCurrentGeneration: true,
    rebindNormalQueueItems: true,
    migrateResponseIntents: false,
    retainOldGenerationForAudit: true,
    oldGenerationAcceptsNewWork: false,
    mcpInFlight,
    affectedSessionScope: "coworker_sessions_only",
  };
}

export function decideQueueItemRebind(inputType: TurnQueueInputType): QueueItemRebindDecision {
  if (inputType === "normal" || inputType === "correction") {
    return { action: "rebind_to_current", inputType };
  }
  return { action: "never_migrate", inputType, reason: "response_intent" };
}

/**
 * In-flight MCP during rotation is reconciled honestly — never treated as a
 * denied queue claim.
 */
export function reconcileMcpDuringRotation(knownTerminal: boolean): {
  outcome: McpInFlightOutcome;
  denyByClaim: false;
} {
  return {
    outcome: renderInFlightMcpOutcome(knownTerminal),
    denyByClaim: false,
  };
}

export type AtomicGenerationSwapSteps = {
  insertSessionRevision: true;
  insertGenerationHistoryRow: true;
  swapCurrentGenerationId: true;
  retireOldGeneration: true;
  overwriteOldTrueForgeIds: false;
};

export function atomicGenerationSwapContract(): AtomicGenerationSwapSteps {
  return {
    insertSessionRevision: true,
    insertGenerationHistoryRow: true,
    swapCurrentGenerationId: true,
    retireOldGeneration: true,
    overwriteOldTrueForgeIds: false,
  };
}
