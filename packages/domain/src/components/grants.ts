import { createHash } from "node:crypto";
import type {
  ComponentDefinition,
  ComponentDefinitionInput,
  ComponentExposure,
} from "./descriptor";
import { buildComponentDescriptorPreimage, hashComponentDescriptor } from "./descriptor";
import { canonicalizeJson } from "./jcs";

export type ComponentAvailabilityReason =
  "not_published" | "not_granted" | "server_only" | "descriptor_mismatch";

export type ComponentAvailabilityResult =
  | { available: true }
  | {
      available: false;
      reason: ComponentAvailabilityReason;
      expectedDescriptorHash?: string;
      actualDescriptorHash?: string;
    };

export type GrantScopePreimageV1 = {
  schemaVersion: 1;
  workspaceId: string;
  channelId: string;
  agentProfileId: string;
  componentVersionId: string;
};

export function isComponentEffectivelyGranted(input: {
  exposure: ComponentExposure;
  hasActiveGrant: boolean;
  published: boolean;
}): boolean {
  if (!input.published || !input.hasActiveGrant) {
    return false;
  }
  if (input.exposure === "server_only") {
    return false;
  }
  return true;
}

export function canOfferToCoworker(def: Pick<ComponentDefinition, "exposure">): boolean {
  return def.exposure === "agent_tool";
}

export function intersectComponentAvailability(input: {
  definition: ComponentDefinition;
  published: boolean;
  activeGrant: boolean;
  expectedDescriptorHash?: string;
}): ComponentAvailabilityResult {
  if (!input.published) {
    return { available: false, reason: "not_published" };
  }
  if (input.definition.exposure === "server_only") {
    return { available: false, reason: "server_only" };
  }
  if (
    input.expectedDescriptorHash !== undefined &&
    input.expectedDescriptorHash !== input.definition.descriptorHash
  ) {
    return {
      available: false,
      reason: "descriptor_mismatch",
      expectedDescriptorHash: input.expectedDescriptorHash,
      actualDescriptorHash: input.definition.descriptorHash,
    };
  }
  if (!input.activeGrant) {
    return { available: false, reason: "not_granted" };
  }
  return { available: true };
}

export function buildGrantScopePreimage(input: {
  workspaceId: string;
  channelId: string;
  agentProfileId: string;
  componentVersionId: string;
}): GrantScopePreimageV1 {
  return {
    schemaVersion: 1,
    workspaceId: input.workspaceId,
    channelId: input.channelId,
    agentProfileId: input.agentProfileId,
    componentVersionId: input.componentVersionId,
  };
}

export function hashGrantScope(preimage: GrantScopePreimageV1): string {
  const digest = createHash("sha256").update(canonicalizeJson(preimage), "utf8").digest("hex");
  return `sha256:${digest}`;
}

export function recomputeDescriptorHash(definition: ComponentDefinitionInput): string {
  return hashComponentDescriptor(buildComponentDescriptorPreimage(definition));
}
