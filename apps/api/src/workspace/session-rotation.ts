/**
 * API-facing helper that runs capability-affecting session rotation for one
 * channel/coworker logical session. Used by coworker updates and component grants.
 */
import {
  abortSessionRotation,
  atomicSwapSessionGeneration,
  beginSessionRotation,
  completeSessionRotation,
  markCancelCalled,
  recordMcpRotationOutcome,
  requestRunStepStop,
  type SessionRotationReason,
  type SessionRotationSqlClient,
} from "@forgeroom/db";
import {
  intersectEffectiveComponentTools,
  intersectEffectiveTools,
  intersectPinnedSkills,
  type CapabilityIntersectionInput,
  type ControlledComponentCandidate,
  type SkillRequirementManifest,
} from "@forgeroom/orchestration/capability-intersection";
import { rotateChannelCoworkerSession } from "@forgeroom/orchestration/session";
import { loadTrueForgeClientFromEnv, type TrueForgeClient } from "@forgeroom/trueforge";
import type { CoworkerRecord } from "./store";
import {
  modelPresetFromCoworker,
  sandboxEnabledFromCoworker,
  standingInstructionsFromCoworker,
} from "./session-provision";

export type RotateOwnedSessionInput = {
  sql: SessionRotationSqlClient;
  channelAgentSessionId: string;
  coworker: CoworkerRecord;
  channelId: string;
  workspaceId: string;
  createdBy: string;
  reason: SessionRotationReason;
  previousTools: readonly string[];
  capability: CapabilityIntersectionInput;
  componentCandidates?: readonly ControlledComponentCandidate[];
  pinnedSkillNames?: readonly string[];
  skillManifests?: readonly SkillRequirementManifest[];
  hasActiveTurn?: boolean;
  mcpInFlightKnownTerminal?: boolean | null;
  activeTurnId?: string | null;
  activeRunStepId?: string | null;
  client?: TrueForgeClient;
  env?: NodeJS.ProcessEnv;
  now?: string;
};

export type RotateOwnedSessionResult = {
  sessionId: string;
  newGenerationId: string;
  newTrueforgeSessionId: string;
  retiredGenerationId: string;
  retainedOldTrueforgeSessionId: string;
  effectiveTools: string[];
  effectiveSpecHash: string;
  approvalPolicyHash: string;
  staleProposalIds: string[];
  cancelRequested: boolean;
};

export async function rotateOwnedChannelCoworkerSession(
  input: RotateOwnedSessionInput,
): Promise<RotateOwnedSessionResult> {
  const now = input.now ?? new Date().toISOString();
  const nextTools = intersectEffectiveTools(input.capability).tools;
  const components = intersectEffectiveComponentTools(input.componentCandidates ?? []);
  const pinnedSkills = intersectPinnedSkills({
    pinnedSkillNames: input.pinnedSkillNames ?? [],
    manifests: input.skillManifests ?? [],
    effectiveTools: nextTools,
    effectiveComponentTools: components.map((row) => row.toolName),
  });

  const begun = await beginSessionRotation(input.sql, {
    channelAgentSessionId: input.channelAgentSessionId,
    agentProfileId: input.coworker.id,
    reason: input.reason,
    previousTools: input.previousTools,
    nextTools,
    hasActiveTurn: input.hasActiveTurn ?? false,
    mcpInFlightKnownTerminal: input.mcpInFlightKnownTerminal ?? null,
    now,
  });

  let swapped = false;
  let newGenerationId: string | null = null;
  try {
    if (begun.requestActiveTurnCancellation && input.activeRunStepId) {
      const stop = await requestRunStepStop(input.sql, { runStepId: input.activeRunStepId, now });
      if (stop.ok && stop.decision.callCancel) {
        const client = input.client ?? loadTrueForgeClientFromEnv(input.env ?? process.env);
        if (stop.trueforgeSessionId) {
          await client.cancelSession(stop.trueforgeSessionId);
        }
        if (stop.agentTurnId) {
          await markCancelCalled(input.sql, { agentTurnId: stop.agentTurnId, now });
        }
      }
    }
    if (input.mcpInFlightKnownTerminal !== null && input.mcpInFlightKnownTerminal !== undefined) {
      await recordMcpRotationOutcome(input.sql, {
        channelAgentSessionId: input.channelAgentSessionId,
        agentTurnId: input.activeTurnId ?? null,
        knownTerminal: input.mcpInFlightKnownTerminal,
        now,
      });
    }

    const client = input.client ?? loadTrueForgeClientFromEnv(input.env ?? process.env);

    const rotated = await rotateChannelCoworkerSession(client, {
      channelAgentSessionId: input.channelAgentSessionId,
      reason: input.reason,
      previousTools: input.previousTools,
      nextGeneration: begun.previousGeneration + 1,
      sourceConfigRevision: begun.sourceConfigRevision,
      agentVersionId: input.coworker.currentVersionId,
      capability: input.capability,
      componentCandidates: input.componentCandidates,
      pinnedSkillNames: pinnedSkills,
      skillManifests: input.skillManifests,
      coworker: {
        id: input.coworker.id,
        handle: input.coworker.handle,
        name: input.coworker.name,
        title: input.coworker.title,
        configRevision: input.coworker.configRevision,
        standingInstructions: standingInstructionsFromCoworker(input.coworker),
        modelPreset: modelPresetFromCoworker(input.coworker),
        sandboxEnabled: sandboxEnabledFromCoworker(input.coworker),
      },
      channelId: input.channelId,
      workspaceId: input.workspaceId,
      createdBy: input.createdBy,
      hasActiveTurn: input.hasActiveTurn ?? false,
      mcpInFlightKnownTerminal: input.mcpInFlightKnownTerminal ?? null,
    });

    const swap = await atomicSwapSessionGeneration(input.sql, {
      channelAgentSessionId: input.channelAgentSessionId,
      previousGenerationId: begun.previousGenerationId,
      staleUnresolvedActions: begun.staleUnresolvedActions,
      now,
      revision: {
        id: rotated.revision.id,
        agentProfileId: rotated.revision.agentProfileId,
        sourceConfigRevision: rotated.revision.sourceConfigRevision,
        effectiveConfigRedactedJson: rotated.revision.effectiveConfigRedacted,
        effectiveSpecHash: rotated.revision.effectiveSpecHash,
        approvalPolicyHash: rotated.revision.approvalPolicyHash,
        createdBy: rotated.revision.createdBy,
        createdAt: rotated.revision.createdAt,
      },
      generation: {
        id: rotated.generation.id,
        channelAgentSessionId: input.channelAgentSessionId,
        generation: rotated.generation.generation,
        agentVersionId: rotated.generation.agentVersionId,
        sessionRevisionId: rotated.revision.id,
        trueforgeSessionId: rotated.trueforgeSessionId,
        effectiveSpecHash: rotated.revision.effectiveSpecHash,
        approvalPolicyHash: rotated.revision.approvalPolicyHash,
        state: "ready",
        createdAt: rotated.generation.createdAt,
        retiredAt: null,
      },
    });
    swapped = true;
    newGenerationId = swap.newGenerationId;

    await completeSessionRotation(input.sql, {
      channelAgentSessionId: input.channelAgentSessionId,
      now,
    });

    return {
      sessionId: input.channelAgentSessionId,
      newGenerationId: swap.newGenerationId,
      newTrueforgeSessionId: rotated.trueforgeSessionId,
      retiredGenerationId: swap.retiredGenerationId,
      retainedOldTrueforgeSessionId: swap.retainedOldTrueforgeSessionId,
      effectiveTools: rotated.effectiveTools,
      effectiveSpecHash: rotated.revision.effectiveSpecHash,
      approvalPolicyHash: rotated.revision.approvalPolicyHash,
      staleProposalIds: swap.staleProposalIds,
      cancelRequested: begun.requestActiveTurnCancellation,
    };
  } catch (error) {
    await abortSessionRotation(input.sql, {
      channelAgentSessionId: input.channelAgentSessionId,
      restoreGenerationId: begun.previousGenerationId,
      abortGenerationId: swapped ? newGenerationId : null,
      now,
    });
    throw error;
  }
}
