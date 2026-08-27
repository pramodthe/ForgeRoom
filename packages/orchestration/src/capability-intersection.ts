/**
 * Server-side effective capability intersection (security.md).
 * The model is never an authorization principal — AG-UI tools are claims only.
 */

export type ConnectorCapabilitySlice = {
  connectorName: string;
  /** Tools allowed by the connector binding / pinned toolkit. */
  connectorAllowedTools: readonly string[];
  /** Exact pinned account must be active; otherwise the slice contributes nothing. */
  accountActive: boolean;
  /** Literal AgentSpec enable_tools for this connector (compiled allowlist). */
  agentSpecEnabledTools: readonly string[];
  /** Tools that require approval in the AgentSpec. */
  approvalRequiredTools?: readonly string[];
};

export type CapabilityIntersectionInput = {
  /** Workspace policy allowlist. Empty ⇒ no external tools. */
  workspacePolicyTools: readonly string[];
  /** Channel-scoped tool grants. Empty ⇒ no external tools. */
  channelGrantTools: readonly string[];
  /** Coworker-scoped tool grants. Empty ⇒ no external tools. */
  coworkerGrantTools: readonly string[];
  connectors: readonly ConnectorCapabilitySlice[];
};

export type EffectiveConnectorTools = {
  connectorName: string;
  enabledTools: string[];
  approvalRequiredTools: string[];
};

export type EffectiveToolCapability = {
  /** Flat sorted unique tool names across connectors. */
  tools: string[];
  connectors: EffectiveConnectorTools[];
};

export type ControlledComponentCandidate = {
  stableName: string;
  toolName: string;
  published: boolean;
  activeGrant: boolean;
  exposure: "agent_tool" | "server_only";
  expectedDescriptorHash?: string;
  actualDescriptorHash: string;
};

export type EffectiveComponentTool = {
  stableName: string;
  toolName: string;
  descriptorHash: string;
};

export type SkillRequirementManifest = {
  skillName: string;
  /** Declared required tools — grant nothing; must already be effective. */
  requiredTools?: readonly string[];
  /** Declared required component tool names. */
  requiredComponentTools?: readonly string[];
  /** Declared required data grant keys (must already exist; skill cannot mint). */
  requiredDataGrants?: readonly string[];
  /** Declared approval boundaries (informational; cannot widen). */
  requiredApprovals?: readonly string[];
};

export type SkillAttachDecision =
  | {
      ok: true;
      skillName: string;
      rotatesSessions: true;
    }
  | {
      ok: false;
      skillName: string;
      reason: "expands_authority" | "missing_capability";
      missingTools?: string[];
      missingComponents?: string[];
      missingDataGrants?: string[];
    };

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function intersectSets(...sets: readonly (readonly string[])[]): string[] {
  if (sets.length === 0) {
    return [];
  }
  let current = new Set(sets[0]);
  for (let i = 1; i < sets.length; i += 1) {
    const next = new Set(sets[i]);
    current = new Set([...current].filter((value) => next.has(value)));
  }
  return sortedUnique(current);
}

/**
 * Effective external tools = ∩(workspace policy, channel grant, coworker grant,
 * connector allowlist, active account, AgentSpec enable_tools).
 * A connected account alone grants nothing.
 */
export function intersectEffectiveTools(
  input: CapabilityIntersectionInput,
): EffectiveToolCapability {
  const base = intersectSets(
    input.workspacePolicyTools,
    input.channelGrantTools,
    input.coworkerGrantTools,
  );
  const baseSet = new Set(base);
  const connectors: EffectiveConnectorTools[] = [];

  for (const slice of input.connectors) {
    if (!slice.accountActive) {
      connectors.push({
        connectorName: slice.connectorName,
        enabledTools: [],
        approvalRequiredTools: [],
      });
      continue;
    }
    const enabled = intersectSets(
      base,
      slice.connectorAllowedTools,
      slice.agentSpecEnabledTools,
    );
    const approvalRequired = sortedUnique(
      (slice.approvalRequiredTools ?? []).filter((tool) => enabled.includes(tool)),
    );
    connectors.push({
      connectorName: slice.connectorName,
      enabledTools: enabled,
      approvalRequiredTools: approvalRequired,
    });
  }

  const tools = sortedUnique(connectors.flatMap((row) => row.enabledTools));
  // Drop anything that somehow escaped the base intersection.
  return {
    tools: tools.filter((tool) => baseSet.has(tool)),
    connectors,
  };
}

/**
 * Controlled-component tools offered to TrueForge: published ∩ agent_tool ∩
 * positive grant ∩ matching descriptor hash (call-time recheck uses the same).
 */
export function intersectEffectiveComponentTools(
  candidates: readonly ControlledComponentCandidate[],
): EffectiveComponentTool[] {
  const out: EffectiveComponentTool[] = [];
  for (const row of candidates) {
    if (!row.published || !row.activeGrant || row.exposure !== "agent_tool") {
      continue;
    }
    if (
      row.expectedDescriptorHash !== undefined &&
      row.expectedDescriptorHash !== row.actualDescriptorHash
    ) {
      continue;
    }
    out.push({
      stableName: row.stableName,
      toolName: row.toolName,
      descriptorHash: row.actualDescriptorHash,
    });
  }
  return out.sort((a, b) => a.toolName.localeCompare(b.toolName));
}

/**
 * Call-time recheck for a component tool already offered in a prior revision.
 * Stale descriptor/grant/publication fails closed even if the session still
 * advertises the old tool until rotation completes.
 */
export function recheckComponentToolCall(input: {
  candidate: ControlledComponentCandidate;
  offeredInCurrentRevision: boolean;
}): { ok: true } | { ok: false; reason: "stale_or_ungranted" | "not_offered" } {
  if (!input.offeredInCurrentRevision) {
    return { ok: false, reason: "not_offered" };
  }
  const available = intersectEffectiveComponentTools([input.candidate]);
  if (available.length === 0) {
    return { ok: false, reason: "stale_or_ungranted" };
  }
  return { ok: true };
}

/**
 * P0 skills are instruction-only procedure. Attachment cannot expand tools,
 * accounts, data grants or approval authority — requirements must already be
 * inside the effective intersection.
 */
export function decideSkillAttach(input: {
  skill: SkillRequirementManifest;
  effectiveTools: readonly string[];
  effectiveComponentTools: readonly string[];
  existingDataGrants?: readonly string[];
}): SkillAttachDecision {
  const toolSet = new Set(input.effectiveTools);
  const componentSet = new Set(input.effectiveComponentTools);
  const dataSet = new Set(input.existingDataGrants ?? []);

  const missingTools = (input.skill.requiredTools ?? []).filter((tool) => !toolSet.has(tool));
  const missingComponents = (input.skill.requiredComponentTools ?? []).filter(
    (tool) => !componentSet.has(tool),
  );
  const missingDataGrants = (input.skill.requiredDataGrants ?? []).filter(
    (key) => !dataSet.has(key),
  );

  if (missingTools.length > 0 || missingComponents.length > 0 || missingDataGrants.length > 0) {
    return {
      ok: false,
      skillName: input.skill.skillName,
      reason: missingTools.length > 0 || missingComponents.length > 0 || missingDataGrants.length > 0
        ? "missing_capability"
        : "expands_authority",
      ...(missingTools.length > 0 ? { missingTools } : {}),
      ...(missingComponents.length > 0 ? { missingComponents } : {}),
      ...(missingDataGrants.length > 0 ? { missingDataGrants } : {}),
    };
  }

  // requiredApprovals are documentary — skills cannot widen approval policy.
  return {
    ok: true,
    skillName: input.skill.skillName,
    rotatesSessions: true,
  };
}

/** Filter pinned skill names to those that remain attachable under current authority. */
export function intersectPinnedSkills(input: {
  pinnedSkillNames: readonly string[];
  manifests: readonly SkillRequirementManifest[];
  effectiveTools: readonly string[];
  effectiveComponentTools: readonly string[];
  existingDataGrants?: readonly string[];
}): string[] {
  const byName = new Map(input.manifests.map((row) => [row.skillName, row]));
  const kept: string[] = [];
  for (const name of input.pinnedSkillNames) {
    const manifest = byName.get(name);
    if (!manifest) {
      continue;
    }
    const decision = decideSkillAttach({
      skill: manifest,
      effectiveTools: input.effectiveTools,
      effectiveComponentTools: input.effectiveComponentTools,
      existingDataGrants: input.existingDataGrants,
    });
    if (decision.ok) {
      kept.push(name);
    }
  }
  return sortedUnique(kept);
}

export function isCapabilityRestriction(
  previousTools: readonly string[],
  nextTools: readonly string[],
): boolean {
  const next = new Set(nextTools);
  return previousTools.some((tool) => !next.has(tool));
}
