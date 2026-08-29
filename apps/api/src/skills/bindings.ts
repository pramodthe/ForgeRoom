import type {
  SessionResponse,
  SkillBinding,
  SkillBindingCreateCommand,
  SkillBindingDeleteCommand,
  SkillVersion,
} from "@forgeroom/contracts";
import { skillBindingSchema } from "@forgeroom/contracts";
import {
  attachSkillBindingRecord,
  detachSkillBindingRecord,
  findActiveSkillBinding,
  getSkillBindingById,
  loadControlledComponentCandidates,
  loadPinnedSkillStableNames,
  loadPublishedSkillVersionForAttach,
  type createSql,
} from "@forgeroom/db";
import {
  decideSkillAttach,
  intersectEffectiveComponentTools,
  intersectEffectiveTools,
  type SkillRequirementManifest,
} from "@forgeroom/orchestration/capability-intersection";
import { createHash } from "node:crypto";
import type { WorkspaceServiceResult } from "../workspace/service";
import type { CoworkerEditableConfig, CoworkerRecord } from "../workspace/store";
import { connectorsFromCoworker } from "../workspace/session-provision";
import { rotateSkillBindingSessions } from "./skill-binding-rotation";
import type { TrueForgeClient } from "@forgeroom/trueforge";
import type { ApiEnv } from "../env";

type SqlClient = ReturnType<typeof createSql>;

function specHash(config: Record<string, unknown>): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(config)).digest("hex")}`;
}

async function loadNextAgentVersionNumber(sql: SqlClient, coworkerId: string): Promise<number> {
  const rows = await sql<{ next_version: number }[]>`
    SELECT COALESCE(MAX(version), 0) + 1 AS next_version
    FROM agent_versions
    WHERE agent_profile_id = ${coworkerId}
  `;
  return rows[0]?.next_version ?? 1;
}

function buildCapabilityInput(coworker: CoworkerRecord) {
  const tools = [...coworker.editableConfigJson.tool_grants];
  const connectors = connectorsFromCoworker(coworker).map((connector) => ({
    connectorName: connector.name,
    connectorAllowedTools: connector.enabledTools,
    accountActive: true,
    agentSpecEnabledTools: connector.enabledTools,
    approvalRequiredTools: connector.approvalRequiredTools,
  }));
  if (connectors.length === 0 && tools.length > 0) {
    connectors.push({
      connectorName: "workspace",
      connectorAllowedTools: tools,
      accountActive: true,
      agentSpecEnabledTools: tools,
      approvalRequiredTools: [],
    });
  }
  return {
    workspacePolicyTools: tools,
    channelGrantTools: tools,
    coworkerGrantTools: tools,
    connectors,
  };
}

function componentToolNamesForVersion(
  candidates: Awaited<ReturnType<typeof loadControlledComponentCandidates>>,
  requiredComponentVersionIds: readonly string[],
): string[] {
  const required = new Set(requiredComponentVersionIds);
  return candidates
    .filter((candidate) => required.has(candidate.componentVersionId))
    .map((candidate) => candidate.toolName)
    .sort();
}

function buildSkillManifest(
  stableName: string,
  version: SkillVersion,
  requiredComponentToolNames: readonly string[],
): SkillRequirementManifest {
  return {
    skillName: stableName,
    requiredTools: [...version.required_tools],
    requiredComponentTools: [...requiredComponentToolNames],
    requiredApprovals: [...version.required_approvals],
  };
}

function withSkillVersionId(
  config: CoworkerEditableConfig,
  skillVersionId: string,
  remove: boolean,
): CoworkerEditableConfig {
  const ids = new Set(config.skill_version_ids);
  if (remove) {
    ids.delete(skillVersionId);
  } else {
    ids.add(skillVersionId);
  }
  return {
    ...config,
    skill_version_ids: [...ids].sort(),
  };
}

export async function attachSkillBindingForSession(
  sql: SqlClient,
  session: SessionResponse,
  coworkerId: string,
  command: SkillBindingCreateCommand,
  ids: { bindingId: string; agentVersionId: string },
  deps: {
    coworker: CoworkerRecord;
    trueforgeClient?: TrueForgeClient;
    apiEnv?: ApiEnv;
    now: () => Date;
  },
): Promise<WorkspaceServiceResult<SkillBinding>> {
  const published = await loadPublishedSkillVersionForAttach(
    sql,
    command.skill_version_id,
    session.workspace_id,
  );
  if (!published) {
    return { ok: false, error: { code: "not_found", message: "Skill version not found." } };
  }
  if (published.version.manifest_hash !== command.expected_manifest_hash) {
    return {
      ok: false,
      error: {
        code: "validation_failed",
        message: "Skill manifest hash does not match the published version.",
      },
    };
  }
  if (deps.coworker.id !== coworkerId || deps.coworker.workspaceId !== session.workspace_id) {
    return { ok: false, error: { code: "not_found", message: "Coworker not found." } };
  }
  if (deps.coworker.configRevision !== command.expected_coworker_config_revision) {
    return {
      ok: false,
      error: {
        code: "conflict",
        message: "Coworker changed concurrently; refresh and retry.",
        details: {
          reason: "coworker_concurrent_modification",
          actual_config_revision: deps.coworker.configRevision,
        },
      },
    };
  }

  const componentCandidates = await loadControlledComponentCandidates(sql, {
    workspaceId: session.workspace_id,
    channelId: published.channelId,
    agentProfileId: coworkerId,
  });
  const requiredComponentTools = componentToolNamesForVersion(
    componentCandidates,
    published.version.required_components,
  );
  const capability = buildCapabilityInput(deps.coworker);
  const effectiveTools = intersectEffectiveTools(capability).tools;
  const effectiveComponentTools = intersectEffectiveComponentTools(componentCandidates).map(
    (row) => row.toolName,
  );
  const decision = decideSkillAttach({
    skill: buildSkillManifest(published.stableName, published.version, requiredComponentTools),
    effectiveTools,
    effectiveComponentTools,
  });
  if (!decision.ok) {
    return {
      ok: false,
      error: {
        code: "validation_failed",
        message: "Skill attachment is missing required authority.",
        details: {
          reason: decision.reason,
          skill_name: decision.skillName,
          ...(decision.missingTools ? { missing_tools: decision.missingTools } : {}),
          ...(decision.missingComponents ? { missing_components: decision.missingComponents } : {}),
        },
      },
    };
  }

  const now = deps.now().toISOString();
  const nextConfig = withSkillVersionId(
    deps.coworker.editableConfigJson,
    command.skill_version_id,
    false,
  );
  const nextVersion = await loadNextAgentVersionNumber(sql, coworkerId);
  const attached = await attachSkillBindingRecord(sql, {
    bindingId: ids.bindingId,
    coworkerId,
    workspaceId: session.workspace_id,
    skillVersionId: command.skill_version_id,
    expectedManifestHash: command.expected_manifest_hash,
    expectedConfigRevision: command.expected_coworker_config_revision,
    attachedBy: session.user.id,
    agentVersionId: ids.agentVersionId,
    nextAgentVersion: nextVersion,
    nextConfigRevision: deps.coworker.configRevision + 1,
    nextEditableConfig: nextConfig,
    specHash: specHash(nextConfig),
    channelId: published.channelId,
    sourceRunId: published.sourceRunId,
    skillId: published.skillId,
    manifestHash: published.version.manifest_hash,
    now,
  });

  if (!attached.ok) {
    if (attached.code === "config_revision_mismatch") {
      return {
        ok: false,
        error: {
          code: "conflict",
          message: "Coworker changed concurrently; refresh and retry.",
          details: { reason: "coworker_concurrent_modification" },
        },
      };
    }
    if (attached.code === "manifest_mismatch") {
      return {
        ok: false,
        error: {
          code: "validation_failed",
          message: "Skill manifest hash does not match the published version.",
        },
      };
    }
    return { ok: false, error: { code: "not_found", message: "Skill version not found." } };
  }

  if (!attached.alreadyAttached && deps.trueforgeClient) {
    const updatedCoworker: CoworkerRecord = {
      ...deps.coworker,
      editableConfigJson: nextConfig,
      configRevision: attached.configRevision,
      currentVersionId: ids.agentVersionId,
      updatedAt: now,
    };
    const pinnedSkillNames = await loadPinnedSkillStableNames(sql, nextConfig.skill_version_ids);
    await rotateSkillBindingSessions({
      sql,
      coworker: updatedCoworker,
      workspaceId: session.workspace_id,
      createdBy: session.user.id,
      reason: "skill_attach",
      pinnedSkillNames,
      skillManifests: [
        buildSkillManifest(published.stableName, published.version, requiredComponentTools),
      ],
      client: deps.trueforgeClient,
      apiEnv: deps.apiEnv,
      now,
    });
  }

  return { ok: true, value: skillBindingSchema.parse(attached.binding) };
}

export async function detachSkillBindingForSession(
  sql: SqlClient,
  session: SessionResponse,
  coworkerId: string,
  bindingId: string,
  command: SkillBindingDeleteCommand,
  ids: { agentVersionId: string },
  deps: {
    coworker: CoworkerRecord;
    trueforgeClient?: TrueForgeClient;
    apiEnv?: ApiEnv;
    now: () => Date;
  },
): Promise<WorkspaceServiceResult<SkillBinding>> {
  const existing = await getSkillBindingById(sql, bindingId);
  if (
    !existing ||
    existing.workspaceId !== session.workspace_id ||
    existing.binding.coworker_id !== coworkerId
  ) {
    return { ok: false, error: { code: "not_found", message: "Skill binding not found." } };
  }
  if (existing.binding.state !== command.expected_state) {
    return {
      ok: false,
      error: {
        code: "validation_failed",
        message: "Skill binding is not in the expected state.",
      },
    };
  }
  if (deps.coworker.id !== coworkerId || deps.coworker.workspaceId !== session.workspace_id) {
    return { ok: false, error: { code: "not_found", message: "Coworker not found." } };
  }

  const published = await loadPublishedSkillVersionForAttach(
    sql,
    existing.binding.skill_version_id,
    session.workspace_id,
  );
  if (!published) {
    return { ok: false, error: { code: "not_found", message: "Skill version not found." } };
  }

  const now = deps.now().toISOString();
  const nextConfig = withSkillVersionId(
    deps.coworker.editableConfigJson,
    existing.binding.skill_version_id,
    true,
  );
  const nextVersion = await loadNextAgentVersionNumber(sql, coworkerId);
  const detached = await detachSkillBindingRecord(sql, {
    bindingId,
    coworkerId,
    workspaceId: session.workspace_id,
    expectedState: command.expected_state,
    expectedConfigRevision: deps.coworker.configRevision,
    detachedBy: session.user.id,
    agentVersionId: ids.agentVersionId,
    nextAgentVersion: nextVersion,
    nextConfigRevision: deps.coworker.configRevision + 1,
    nextEditableConfig: nextConfig,
    specHash: specHash(nextConfig),
    channelId: published.channelId,
    sourceRunId: published.sourceRunId,
    skillVersionId: existing.binding.skill_version_id,
    skillId: published.skillId,
    manifestHash: published.version.manifest_hash,
    now,
  });

  if (!detached.ok) {
    if (detached.code === "state_mismatch") {
      return {
        ok: false,
        error: {
          code: "validation_failed",
          message: "Skill binding is not in the expected state.",
        },
      };
    }
    return { ok: false, error: { code: "not_found", message: "Skill binding not found." } };
  }

  if (!detached.alreadyDetached && deps.trueforgeClient) {
    const updatedCoworker: CoworkerRecord = {
      ...deps.coworker,
      editableConfigJson: nextConfig,
      configRevision: detached.configRevision,
      currentVersionId: ids.agentVersionId,
      updatedAt: now,
    };
    const pinnedSkillNames = await loadPinnedSkillStableNames(sql, nextConfig.skill_version_ids);
    await rotateSkillBindingSessions({
      sql,
      coworker: updatedCoworker,
      workspaceId: session.workspace_id,
      createdBy: session.user.id,
      reason: "skill_detach",
      pinnedSkillNames,
      skillManifests: [],
      client: deps.trueforgeClient,
      apiEnv: deps.apiEnv,
      now,
    });
  }

  return { ok: true, value: skillBindingSchema.parse(detached.binding) };
}

export async function getSkillBindingForSession(
  sql: SqlClient,
  session: SessionResponse,
  bindingId: string,
): Promise<WorkspaceServiceResult<SkillBinding>> {
  const loaded = await getSkillBindingById(sql, bindingId);
  if (!loaded || loaded.workspaceId !== session.workspace_id) {
    return { ok: false, error: { code: "not_found", message: "Skill binding not found." } };
  }
  return { ok: true, value: skillBindingSchema.parse(loaded.binding) };
}

export async function findActiveSkillBindingForSession(
  sql: SqlClient,
  session: SessionResponse,
  coworkerId: string,
  skillVersionId: string,
): Promise<SkillBinding | null> {
  const coworker = await sql<{ workspace_id: string }[]>`
    SELECT workspace_id FROM agent_profiles WHERE id = ${coworkerId} LIMIT 1
  `;
  if (coworker[0]?.workspace_id !== session.workspace_id) {
    return null;
  }
  const binding = await findActiveSkillBinding(sql, coworkerId, skillVersionId);
  return binding ? skillBindingSchema.parse(binding) : null;
}
