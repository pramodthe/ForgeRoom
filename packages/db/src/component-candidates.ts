import type postgres from "postgres";
import { componentToolName } from "@forgeroom/domain";
import { hasActiveComponentGrant, listPublishedComponentVersions } from "./component-registry";

type SqlClient = postgres.Sql;

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return null;
  }
  return [...value].sort() as string[];
}

function readEffectiveConfig(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

export type ControlledComponentCandidateRow = {
  stableName: string;
  toolName: string;
  componentVersionId: string;
  published: boolean;
  activeGrant: boolean;
  exposure: "agent_tool" | "server_only";
  actualDescriptorHash: string;
};

export async function loadControlledComponentCandidates(
  sql: SqlClient,
  input: {
    workspaceId: string;
    channelId: string;
    agentProfileId: string;
  },
): Promise<ControlledComponentCandidateRow[]> {
  const published = await listPublishedComponentVersions(sql, input.workspaceId);
  const candidates: ControlledComponentCandidateRow[] = [];
  for (const row of published) {
    const activeGrant = await hasActiveComponentGrant(sql, {
      componentVersionId: row.id,
      workspaceId: input.workspaceId,
      channelId: input.channelId,
      agentProfileId: input.agentProfileId,
    });
    candidates.push({
      stableName: row.stableName,
      toolName: componentToolName(row.stableName),
      componentVersionId: row.id,
      published: true,
      activeGrant,
      exposure: row.exposure,
      actualDescriptorHash: row.descriptorHash,
    });
  }
  return candidates.sort((a, b) => a.toolName.localeCompare(b.toolName));
}

/** Component tools already compiled into the logical session's current immutable generation. */
export async function loadCurrentSessionComponentToolNames(
  sql: SqlClient,
  channelAgentSessionId: string,
): Promise<string[] | null> {
  const rows = await sql<{ effective_config: unknown }[]>`
    SELECT sr.effective_config_redacted_json AS effective_config
    FROM channel_agent_sessions AS s
    JOIN channel_agent_session_generations AS g ON g.id = s.current_generation_id
    JOIN session_revisions AS sr ON sr.id = g.session_revision_id
    WHERE s.id = ${channelAgentSessionId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) {
    return null;
  }
  return readStringArray(readEffectiveConfig(row.effective_config).component_tool_names);
}
