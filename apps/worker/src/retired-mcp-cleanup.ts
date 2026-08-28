import { listDrainableRetiredSessionGenerationIds, type createSql } from "@forgeroom/db";
import { unregisterUiComponentsMcpServer } from "@forgeroom/ui-components-mcp";
import type { TrueForgeClient } from "@forgeroom/trueforge";

type SqlClient = ReturnType<typeof createSql>;

export async function drainRetiredUiComponentsMcpForSession(
  sql: SqlClient,
  client: Pick<TrueForgeClient, "deleteHeaderAuthMcpServer">,
  channelAgentSessionId: string,
): Promise<void> {
  const generationIds = await listDrainableRetiredSessionGenerationIds(sql, channelAgentSessionId);
  for (const generationId of generationIds) {
    try {
      await unregisterUiComponentsMcpServer(client, { generationId });
    } catch (cleanupError) {
      console.error("ui_components_mcp connector cleanup failed", {
        channelAgentSessionId,
        generationId,
        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      });
    }
  }
}

export async function drainRetiredUiComponentsMcpForAgentTurn(
  sql: SqlClient,
  client: Pick<TrueForgeClient, "deleteHeaderAuthMcpServer">,
  agentTurnId: string,
): Promise<void> {
  const rows = await sql<{ channel_agent_session_id: string }[]>`
    SELECT channel_agent_session_id
    FROM agent_turns
    WHERE id = ${agentTurnId}
    LIMIT 1
  `;
  const channelAgentSessionId = rows[0]?.channel_agent_session_id;
  if (!channelAgentSessionId) {
    return;
  }
  await drainRetiredUiComponentsMcpForSession(sql, client, channelAgentSessionId);
}
