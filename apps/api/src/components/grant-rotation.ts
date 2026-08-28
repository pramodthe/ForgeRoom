import {
  findRemoteActiveTurnForSession,
  loadControlledComponentCandidates,
  loadCurrentSessionComponentToolNames,
  type createSql,
  type SessionRotationReason,
} from "@forgeroom/db";
import type { TrueForgeClient } from "@forgeroom/trueforge";
import type { WorkspaceCatalogStore } from "../workspace/store";
import type { ApiEnv } from "../env";
import { rotateOwnedChannelCoworkerSession } from "../workspace/session-rotation";
import { connectorsFromCoworker, skillNamesFromCoworker } from "../workspace/session-provision";

type SqlClient = ReturnType<typeof createSql>;

export async function rotateComponentGrantSessions(input: {
  sql: SqlClient;
  store: WorkspaceCatalogStore;
  client: TrueForgeClient;
  workspaceId: string;
  coworkerId: string;
  sessionIds: readonly string[];
  createdBy: string;
  reason: Extract<SessionRotationReason, "component_grant" | "component_revoke">;
  apiEnv?: ApiEnv;
  now?: string;
  /** Stable work identity supplied by the component grant audit. */
  operationId: string;
  operationStartedAt: string;
  /** True when recovery is reconciling a previously started operation. */
  reconcile: boolean;
}): Promise<void> {
  const coworker = await input.store.getCoworker(input.coworkerId);
  if (!coworker || coworker.workspaceId !== input.workspaceId) {
    throw new Error("coworker not found for component grant rotation");
  }

  const previousTools = [...coworker.editableConfigJson.tool_grants];
  const connectors = connectorsFromCoworker(coworker).map((connector) => ({
    connectorName: connector.name,
    connectorAllowedTools: connector.enabledTools,
    accountActive: true,
    agentSpecEnabledTools: connector.enabledTools,
    approvalRequiredTools: connector.approvalRequiredTools,
  }));

  for (const sessionId of input.sessionIds) {
    const session = await input.store.getChannelAgentSession(sessionId);
    if (!session || session.agentProfileId !== input.coworkerId) {
      continue;
    }
    const componentCandidates = await loadControlledComponentCandidates(input.sql, {
      workspaceId: input.workspaceId,
      channelId: session.channelId,
      agentProfileId: input.coworkerId,
    });
    const desiredComponentTools = componentCandidates
      .filter(
        (candidate) =>
          candidate.published && candidate.activeGrant && candidate.exposure === "agent_tool",
      )
      .map((candidate) => candidate.toolName)
      .sort();
    const currentComponentTools = await loadCurrentSessionComponentToolNames(input.sql, sessionId);
    if (
      currentComponentTools &&
      currentComponentTools.length === desiredComponentTools.length &&
      currentComponentTools.every((toolName, index) => toolName === desiredComponentTools[index])
    ) {
      continue;
    }
    const activeTurn = await findRemoteActiveTurnForSession(input.sql, sessionId);
    await rotateOwnedChannelCoworkerSession({
      sql: input.sql,
      channelAgentSessionId: sessionId,
      coworker,
      channelId: session.channelId,
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
      pinnedSkillNames: skillNamesFromCoworker(coworker),
      client: input.client,
      now: input.now,
      hasActiveTurn: activeTurn !== null,
      activeTurnId: activeTurn?.agentTurnId ?? null,
      activeRunStepId: activeTurn?.runStepId ?? null,
      operationId: input.operationId,
      operationStartedAt: input.operationStartedAt,
      reconcileProviderSession: input.reconcile,
      ...(input.apiEnv ? { apiEnv: input.apiEnv } : {}),
    });
  }
}
