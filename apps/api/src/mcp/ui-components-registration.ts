import {
  registerUiComponentsMcpServer,
  unregisterUiComponentsMcpServer,
} from "@forgeroom/ui-components-mcp";
import {
  listDrainableRetiredSessionGenerationIds,
  recordSessionGenerationMcpConnectorDeleted,
  type SessionRotationSqlClient,
} from "@forgeroom/db";
import type { TrueForgeClient } from "@forgeroom/trueforge";
import type { ApiEnv } from "../env";

export async function registerUiComponentsMcpForGeneration(
  client: TrueForgeClient,
  input: {
    env: ApiEnv;
    generationId: string;
    componentToolNames: readonly string[];
  },
): Promise<void> {
  if (input.componentToolNames.length === 0) {
    return;
  }
  await registerUiComponentsMcpServer(client, {
    appOrigin: input.env.appOrigin,
    generationId: input.generationId,
    masterSecret: input.env.uiComponentsMcpSecret,
  });
}

export async function unregisterUiComponentsMcpForGeneration(
  client: TrueForgeClient,
  input: { generationId: string },
): Promise<void> {
  await unregisterUiComponentsMcpServer(client, input);
}

export async function drainRetiredUiComponentsMcpForSession(
  client: TrueForgeClient,
  sql: SessionRotationSqlClient,
  channelAgentSessionId: string,
): Promise<void> {
  const generationIds = await listDrainableRetiredSessionGenerationIds(sql, channelAgentSessionId);
  for (const generationId of generationIds) {
    try {
      await unregisterUiComponentsMcpForGeneration(client, { generationId });
      await recordSessionGenerationMcpConnectorDeleted(sql, { generationId });
    } catch (cleanupError) {
      console.error("ui_components_mcp connector cleanup failed", {
        channelAgentSessionId,
        generationId,
        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      });
    }
  }
}
