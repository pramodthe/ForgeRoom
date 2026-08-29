import {
  findRemoteActiveTurnForSession,
  listCoworkerChannelSessions,
  loadControlledComponentCandidates,
  type createSql,
  type SessionRotationReason,
} from "@forgeroom/db";
import type { SkillRequirementManifest } from "@forgeroom/orchestration/capability-intersection";
import type { TrueForgeClient } from "@forgeroom/trueforge";
import type { CoworkerRecord } from "../workspace/store";
import { connectorsFromCoworker } from "../workspace/session-provision";
import { rotateOwnedChannelCoworkerSession } from "../workspace/session-rotation";
import type { ApiEnv } from "../env";

type SqlClient = ReturnType<typeof createSql>;

export async function rotateSkillBindingSessions(input: {
  sql: SqlClient;
  coworker: CoworkerRecord;
  workspaceId: string;
  createdBy: string;
  reason: Extract<SessionRotationReason, "skill_attach" | "skill_detach">;
  pinnedSkillNames: readonly string[];
  skillManifests: readonly SkillRequirementManifest[];
  client: TrueForgeClient;
  apiEnv?: ApiEnv;
  now?: string;
}): Promise<string[]> {
  const sessionIds = await listCoworkerChannelSessions(input.sql, {
    workspaceId: input.workspaceId,
    agentProfileId: input.coworker.id,
  });
  const previousTools = [...input.coworker.editableConfigJson.tool_grants];
  const connectors = connectorsFromCoworker(input.coworker).map((connector) => ({
    connectorName: connector.name,
    connectorAllowedTools: connector.enabledTools,
    accountActive: true,
    agentSpecEnabledTools: connector.enabledTools,
    approvalRequiredTools: connector.approvalRequiredTools,
  }));
  if (connectors.length === 0 && previousTools.length > 0) {
    connectors.push({
      connectorName: "workspace",
      connectorAllowedTools: previousTools,
      accountActive: true,
      agentSpecEnabledTools: previousTools,
      approvalRequiredTools: [],
    });
  }

  const rotated: string[] = [];
  for (const sessionId of sessionIds) {
    const session = await input.sql<{ channel_id: string; current_generation_id: string | null }[]>`
      SELECT channel_id, current_generation_id
      FROM channel_agent_sessions
      WHERE id = ${sessionId}
      LIMIT 1
    `;
    const row = session[0];
    if (!row?.current_generation_id) {
      continue;
    }
    const componentCandidates = await loadControlledComponentCandidates(input.sql, {
      workspaceId: input.workspaceId,
      channelId: row.channel_id,
      agentProfileId: input.coworker.id,
    });
    const activeTurn = await findRemoteActiveTurnForSession(input.sql, sessionId);
    await rotateOwnedChannelCoworkerSession({
      sql: input.sql,
      channelAgentSessionId: sessionId,
      coworker: input.coworker,
      channelId: row.channel_id,
      workspaceId: input.workspaceId,
      createdBy: input.createdBy,
      reason: input.reason,
      previousTools,
      capability: {
        workspacePolicyTools: previousTools,
        channelGrantTools: previousTools,
        coworkerGrantTools: previousTools,
        connectors,
      },
      componentCandidates,
      pinnedSkillNames: input.pinnedSkillNames,
      skillManifests: input.skillManifests,
      client: input.client,
      apiEnv: input.apiEnv,
      now: input.now,
      hasActiveTurn: activeTurn !== null,
      activeTurnId: activeTurn?.agentTurnId ?? null,
      activeRunStepId: activeTurn?.runStepId ?? null,
    });
    rotated.push(sessionId);
  }
  return rotated;
}
