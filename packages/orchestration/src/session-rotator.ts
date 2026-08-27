import { randomBytes } from "node:crypto";
import type { TrueForgeClient } from "@forgeroom/trueforge";
import {
  intersectEffectiveComponentTools,
  intersectEffectiveTools,
  intersectPinnedSkills,
  type CapabilityIntersectionInput,
  type ControlledComponentCandidate,
  type SkillRequirementManifest,
} from "./capability-intersection";
import { planSessionRotation, type SessionRotationReason } from "./session-rotation";
import { provisionChannelCoworkerSession } from "./session-provisioner";
import type { SessionRevisionSnapshotInput } from "./session-revision";

function opaqueId(prefix: string): string {
  return `${prefix}_${randomBytes(10).toString("hex")}`;
}

export type RotateChannelCoworkerSessionInput = {
  channelAgentSessionId: string;
  reason: SessionRotationReason;
  previousTools: readonly string[];
  nextGeneration: number;
  /** Monotonic SessionRevision ordinal (max existing + 1). */
  sourceConfigRevision: number;
  agentVersionId?: string | null;
  capability: CapabilityIntersectionInput;
  componentCandidates?: readonly ControlledComponentCandidate[];
  pinnedSkillNames?: readonly string[];
  skillManifests?: readonly SkillRequirementManifest[];
  existingDataGrants?: readonly string[];
  coworker: SessionRevisionSnapshotInput["coworker"];
  channelId: string;
  workspaceId: string;
  createdBy: string;
  hasActiveTurn: boolean;
  mcpInFlightKnownTerminal: boolean | null;
};

export type RotatedChannelCoworkerSession = {
  plan: ReturnType<typeof planSessionRotation>;
  effectiveTools: string[];
  effectiveComponentTools: string[];
  pinnedSkills: string[];
  revision: Awaited<ReturnType<typeof provisionChannelCoworkerSession>>["revision"];
  trueforgeSessionId: string;
  generation: Awaited<ReturnType<typeof provisionChannelCoworkerSession>>["generation"];
};

/**
 * Compile the intersecting capability set, create a new TrueForge session +
 * SessionRevision, and return the immutable generation payload for atomic swap.
 * Persistence / claim blocking / staling are owned by @forgeroom/db session-rotation.
 */
export async function rotateChannelCoworkerSession(
  client: TrueForgeClient,
  input: RotateChannelCoworkerSessionInput,
): Promise<RotatedChannelCoworkerSession> {
  const tools = intersectEffectiveTools(input.capability);
  const components = intersectEffectiveComponentTools(input.componentCandidates ?? []);
  const componentToolNames = components.map((row) => row.toolName);
  const pinnedSkills = intersectPinnedSkills({
    pinnedSkillNames: input.pinnedSkillNames ?? [],
    manifests: input.skillManifests ?? [],
    effectiveTools: tools.tools,
    effectiveComponentTools: componentToolNames,
    existingDataGrants: input.existingDataGrants,
  });

  const plan = planSessionRotation({
    reason: input.reason,
    previousTools: input.previousTools,
    nextTools: tools.tools,
    hasActiveTurn: input.hasActiveTurn,
    mcpInFlightKnownTerminal: input.mcpInFlightKnownTerminal,
  });

  const provisioned = await provisionChannelCoworkerSession(client, {
    channelAgentSessionId: input.channelAgentSessionId,
    generation: input.nextGeneration,
    agentVersionId: input.agentVersionId,
    coworker: input.coworker,
    channelId: input.channelId,
    workspaceId: input.workspaceId,
    connectors: tools.connectors.map((row) => ({
      name: row.connectorName,
      enabledTools: row.enabledTools,
      approvalRequiredTools: row.approvalRequiredTools,
    })),
    componentToolNames,
    skillNames: pinnedSkills,
    sourceConfigRevision: input.sourceConfigRevision,
    createdBy: input.createdBy,
  });

  return {
    plan,
    effectiveTools: tools.tools,
    effectiveComponentTools: componentToolNames,
    pinnedSkills,
    revision: provisioned.revision,
    trueforgeSessionId: provisioned.trueforgeSession.id,
    generation: {
      ...provisioned.generation,
      id: provisioned.generation.id || opaqueId("casg"),
    },
  };
}
