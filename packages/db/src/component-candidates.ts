import type postgres from "postgres";
import { componentToolName } from "@forgeroom/domain";
import { hasActiveComponentGrant, listPublishedComponentVersions } from "./component-registry";

type SqlClient = postgres.Sql;

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
