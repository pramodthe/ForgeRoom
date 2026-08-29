import type postgres from "postgres";
import type { SkillBinding, SkillVersion } from "@forgeroom/contracts";
import { skillBindingSchema, skillVersionSchema } from "@forgeroom/contracts";
import { parseManifestJson } from "./skill-drafts";

type SqlClient = postgres.Sql;

function asIso(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }
  return new Date(parsed).toISOString();
}

function parseManifestVersion(manifestJson: unknown): SkillVersion | null {
  const parsed = skillVersionSchema.safeParse(parseManifestJson(manifestJson));
  return parsed.success ? parsed.data : null;
}

export type PublishedSkillVersionRow = {
  version: SkillVersion;
  skillId: string;
  stableName: string;
  workspaceId: string;
  sourceRunId: string;
  channelId: string;
};

export async function loadPublishedSkillVersionForAttach(
  sql: SqlClient,
  skillVersionId: string,
  workspaceId: string,
): Promise<PublishedSkillVersionRow | null> {
  const rows = await sql<
    {
      manifest_json: unknown;
      state: string;
      skill_id: string;
      stable_name: string;
      workspace_id: string;
      source_run_id: string;
      channel_id: string;
    }[]
  >`
    SELECT sv.manifest_json, sv.state, sv.skill_id, s.stable_name, s.workspace_id,
           sv.source_run_id, r.channel_id
    FROM skill_versions AS sv
    JOIN skills AS s ON s.id = sv.skill_id
    JOIN runs AS r ON r.id = sv.source_run_id
    WHERE sv.id = ${skillVersionId}
      AND s.workspace_id = ${workspaceId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row || row.state !== "published") {
    return null;
  }
  const version = parseManifestVersion(row.manifest_json);
  if (!version) {
    return null;
  }
  return {
    version,
    skillId: row.skill_id,
    stableName: row.stable_name,
    workspaceId: row.workspace_id,
    sourceRunId: row.source_run_id,
    channelId: row.channel_id,
  };
}

export async function loadPinnedSkillStableNames(
  sql: SqlClient,
  skillVersionIds: readonly string[],
): Promise<string[]> {
  if (skillVersionIds.length === 0) {
    return [];
  }
  const rows = await sql<{ stable_name: string }[]>`
    SELECT DISTINCT s.stable_name
    FROM skill_versions AS sv
    JOIN skills AS s ON s.id = sv.skill_id
    WHERE sv.id IN ${sql(skillVersionIds)}
      AND sv.state = 'published'
    ORDER BY s.stable_name ASC
  `;
  return rows.map((row) => row.stable_name);
}

function toSkillBinding(row: {
  id: string;
  agent_profile_id: string;
  skill_version_id: string;
  state: string;
  attached_by: string;
  attached_at: Date | string;
  detached_at: Date | string | null;
}): SkillBinding {
  return skillBindingSchema.parse({
    schemaVersion: 1,
    id: row.id,
    coworker_id: row.agent_profile_id,
    skill_version_id: row.skill_version_id,
    state: row.state,
    attached_by: row.attached_by,
    attached_at: asIso(row.attached_at),
    detached_at: row.detached_at === null ? null : asIso(row.detached_at),
  });
}

export async function getSkillBindingById(
  sql: SqlClient,
  bindingId: string,
): Promise<{ binding: SkillBinding; workspaceId: string } | null> {
  const rows = await sql<
    {
      id: string;
      agent_profile_id: string;
      skill_version_id: string;
      state: string;
      attached_by: string;
      attached_at: Date | string;
      detached_at: Date | string | null;
      workspace_id: string;
    }[]
  >`
    SELECT b.id, b.agent_profile_id, b.skill_version_id, b.state, b.attached_by, b.attached_at,
           b.detached_at, ap.workspace_id
    FROM agent_skill_bindings AS b
    JOIN agent_profiles AS ap ON ap.id = b.agent_profile_id
    WHERE b.id = ${bindingId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) {
    return null;
  }
  return { binding: toSkillBinding(row), workspaceId: row.workspace_id };
}

export async function findActiveSkillBinding(
  sql: SqlClient,
  coworkerId: string,
  skillVersionId: string,
): Promise<SkillBinding | null> {
  const rows = await sql<
    {
      id: string;
      agent_profile_id: string;
      skill_version_id: string;
      state: string;
      attached_by: string;
      attached_at: Date | string;
      detached_at: Date | string | null;
    }[]
  >`
    SELECT id, agent_profile_id, skill_version_id, state, attached_by, attached_at, detached_at
    FROM agent_skill_bindings
    WHERE agent_profile_id = ${coworkerId}
      AND skill_version_id = ${skillVersionId}
      AND state = 'active'
    LIMIT 1
  `;
  const row = rows[0];
  return row ? toSkillBinding(row) : null;
}

export type AttachSkillBindingInput = {
  bindingId: string;
  coworkerId: string;
  workspaceId: string;
  skillVersionId: string;
  expectedManifestHash: string;
  expectedConfigRevision: number;
  attachedBy: string;
  agentVersionId: string;
  nextAgentVersion: number;
  nextConfigRevision: number;
  nextEditableConfig: Record<string, unknown>;
  specHash: string;
  channelId: string;
  sourceRunId: string;
  skillId: string;
  manifestHash: string;
  now: string;
};

export type AttachSkillBindingResult =
  | {
      ok: true;
      binding: SkillBinding;
      configRevision: number;
      alreadyAttached: boolean;
    }
  | {
      ok: false;
      code: "not_found" | "manifest_mismatch" | "config_revision_mismatch" | "coworker_disabled";
    };

export async function attachSkillBindingRecord(
  sql: SqlClient,
  input: AttachSkillBindingInput,
): Promise<AttachSkillBindingResult> {
  const existing = await findActiveSkillBinding(sql, input.coworkerId, input.skillVersionId);
  if (existing && existing.id === input.bindingId) {
    return {
      ok: true,
      binding: existing,
      configRevision: input.nextConfigRevision,
      alreadyAttached: true,
    };
  }
  if (existing) {
    return {
      ok: true,
      binding: existing,
      configRevision: input.nextConfigRevision,
      alreadyAttached: true,
    };
  }

  const published = await loadPublishedSkillVersionForAttach(
    sql,
    input.skillVersionId,
    input.workspaceId,
  );
  if (!published) {
    return { ok: false, code: "not_found" };
  }
  if (published.version.manifest_hash !== input.expectedManifestHash) {
    return { ok: false, code: "manifest_mismatch" };
  }

  const result = await sql.begin(async (tx) => {
    const locked = await tx<
      {
        config_revision: number;
        status: string;
        editable_config_json: unknown;
        current_version_id: string | null;
      }[]
    >`
      SELECT config_revision, status, editable_config_json, current_version_id
      FROM agent_profiles
      WHERE id = ${input.coworkerId}
        AND workspace_id = ${input.workspaceId}
      FOR UPDATE
    `;
    const coworker = locked[0];
    if (!coworker) {
      return { ok: false as const, code: "not_found" as const };
    }
    if (coworker.status !== "active") {
      return { ok: false as const, code: "coworker_disabled" as const };
    }
    if (coworker.config_revision !== input.expectedConfigRevision) {
      return { ok: false as const, code: "config_revision_mismatch" as const };
    }

    await tx`
      INSERT INTO agent_versions (
        id, agent_profile_id, version, config_json, spec_hash, created_by, created_at
      )
      VALUES (
        ${input.agentVersionId}, ${input.coworkerId}, ${input.nextAgentVersion},
        ${JSON.stringify(input.nextEditableConfig)}::jsonb, ${input.specHash},
        ${input.attachedBy}, ${input.now}
      )
    `;
    await tx`
      INSERT INTO agent_skill_bindings (
        id, agent_profile_id, agent_version_id, skill_version_id, state, attached_by, attached_at
      )
      VALUES (
        ${input.bindingId}, ${input.coworkerId}, ${input.agentVersionId}, ${input.skillVersionId},
        'active', ${input.attachedBy}, ${input.now}
      )
    `;
    await tx`
      UPDATE agent_profiles
      SET editable_config_json = ${JSON.stringify(input.nextEditableConfig)}::jsonb,
          current_version_id = ${input.agentVersionId},
          config_revision = ${input.nextConfigRevision},
          updated_at = ${input.now}
      WHERE id = ${input.coworkerId}
    `;
    const channels = await tx<{ next_sequence: number }[]>`
      SELECT next_sequence
      FROM channels
      WHERE id = ${input.channelId}
      FOR UPDATE
    `;
    const sequence = channels[0]?.next_sequence ?? 0;
    await tx`
      INSERT INTO channel_events (
        id, channel_id, sequence, type, actor_type, actor_id, run_id, payload_json, created_at
      )
      VALUES (
        ${`${input.bindingId}_event`},
        ${input.channelId},
        ${sequence},
        'custom',
        'human',
        ${input.attachedBy},
        ${input.sourceRunId},
        ${JSON.stringify({
          event_kind: "skill.binding_changed",
          binding_id: input.bindingId,
          coworker_id: input.coworkerId,
          skill_version_id: input.skillVersionId,
          skill_id: input.skillId,
          state: "active",
          manifest_hash: input.manifestHash,
        })}::jsonb,
        ${input.now}
      )
    `;
    await tx`
      UPDATE channels
      SET next_sequence = ${sequence + 1}, updated_at = ${input.now}
      WHERE id = ${input.channelId}
    `;
    return { ok: true as const };
  });

  if (!result.ok) {
    return result;
  }

  const binding = await findActiveSkillBinding(sql, input.coworkerId, input.skillVersionId);
  if (!binding) {
    return { ok: false, code: "not_found" };
  }
  return {
    ok: true,
    binding,
    configRevision: input.nextConfigRevision,
    alreadyAttached: false,
  };
}

export type DetachSkillBindingInput = {
  bindingId: string;
  coworkerId: string;
  workspaceId: string;
  expectedState: "active" | "blocked";
  expectedConfigRevision: number;
  detachedBy: string;
  agentVersionId: string;
  nextAgentVersion: number;
  nextConfigRevision: number;
  nextEditableConfig: Record<string, unknown>;
  specHash: string;
  channelId: string;
  sourceRunId: string;
  skillVersionId: string;
  skillId: string;
  manifestHash: string;
  now: string;
};

export type DetachSkillBindingResult =
  | { ok: true; binding: SkillBinding; configRevision: number; alreadyDetached: boolean }
  | {
      ok: false;
      code: "not_found" | "state_mismatch" | "config_revision_mismatch" | "coworker_disabled";
    };

export async function detachSkillBindingRecord(
  sql: SqlClient,
  input: DetachSkillBindingInput,
): Promise<DetachSkillBindingResult> {
  const rows = await sql<
    {
      id: string;
      agent_profile_id: string;
      skill_version_id: string;
      state: string;
      attached_by: string;
      attached_at: Date | string;
      detached_at: Date | string | null;
    }[]
  >`
    SELECT id, agent_profile_id, skill_version_id, state, attached_by, attached_at, detached_at
    FROM agent_skill_bindings
    WHERE id = ${input.bindingId}
      AND agent_profile_id = ${input.coworkerId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) {
    return { ok: false, code: "not_found" };
  }
  if (row.state === "detached") {
    return {
      ok: true,
      binding: toSkillBinding(row),
      configRevision: input.nextConfigRevision,
      alreadyDetached: true,
    };
  }
  if (row.state !== input.expectedState) {
    return { ok: false, code: "state_mismatch" };
  }

  const result = await sql.begin(async (tx) => {
    const locked = await tx<{ config_revision: number; status: string }[]>`
      SELECT config_revision, status
      FROM agent_profiles
      WHERE id = ${input.coworkerId}
        AND workspace_id = ${input.workspaceId}
      FOR UPDATE
    `;
    const coworker = locked[0];
    if (!coworker) {
      return { ok: false as const, code: "not_found" as const };
    }
    if (coworker.status !== "active") {
      return { ok: false as const, code: "coworker_disabled" as const };
    }
    if (coworker.config_revision !== input.expectedConfigRevision) {
      return { ok: false as const, code: "config_revision_mismatch" as const };
    }

    await tx`
      UPDATE agent_skill_bindings
      SET state = 'detached', detached_at = ${input.now}
      WHERE id = ${input.bindingId}
        AND state = ${input.expectedState}
    `;
    await tx`
      INSERT INTO agent_versions (
        id, agent_profile_id, version, config_json, spec_hash, created_by, created_at
      )
      VALUES (
        ${input.agentVersionId}, ${input.coworkerId}, ${input.nextAgentVersion},
        ${JSON.stringify(input.nextEditableConfig)}::jsonb, ${input.specHash},
        ${input.detachedBy}, ${input.now}
      )
    `;
    await tx`
      UPDATE agent_profiles
      SET editable_config_json = ${JSON.stringify(input.nextEditableConfig)}::jsonb,
          current_version_id = ${input.agentVersionId},
          config_revision = ${input.nextConfigRevision},
          updated_at = ${input.now}
      WHERE id = ${input.coworkerId}
    `;
    const channels = await tx<{ next_sequence: number }[]>`
      SELECT next_sequence
      FROM channels
      WHERE id = ${input.channelId}
      FOR UPDATE
    `;
    const sequence = channels[0]?.next_sequence ?? 0;
    await tx`
      INSERT INTO channel_events (
        id, channel_id, sequence, type, actor_type, actor_id, run_id, payload_json, created_at
      )
      VALUES (
        ${`${input.bindingId}_detach_event`},
        ${input.channelId},
        ${sequence},
        'custom',
        'human',
        ${input.detachedBy},
        ${input.sourceRunId},
        ${JSON.stringify({
          event_kind: "skill.binding_changed",
          binding_id: input.bindingId,
          coworker_id: input.coworkerId,
          skill_version_id: input.skillVersionId,
          skill_id: input.skillId,
          state: "detached",
          manifest_hash: input.manifestHash,
        })}::jsonb,
        ${input.now}
      )
    `;
    await tx`
      UPDATE channels
      SET next_sequence = ${sequence + 1}, updated_at = ${input.now}
      WHERE id = ${input.channelId}
    `;
    return { ok: true as const };
  });

  if (!result.ok) {
    return result;
  }

  const updated = await sql<
    {
      id: string;
      agent_profile_id: string;
      skill_version_id: string;
      state: string;
      attached_by: string;
      attached_at: Date | string;
      detached_at: Date | string | null;
    }[]
  >`
    SELECT id, agent_profile_id, skill_version_id, state, attached_by, attached_at, detached_at
    FROM agent_skill_bindings
    WHERE id = ${input.bindingId}
    LIMIT 1
  `;
  const updatedRow = updated[0];
  if (!updatedRow) {
    return { ok: false, code: "not_found" };
  }
  return {
    ok: true,
    binding: toSkillBinding(updatedRow),
    configRevision: input.nextConfigRevision,
    alreadyDetached: false,
  };
}
