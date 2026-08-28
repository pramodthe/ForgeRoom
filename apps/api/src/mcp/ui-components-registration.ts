import {
  registerUiComponentsMcpServer,
  unregisterUiComponentsMcpServer,
} from "@forgeroom/ui-components-mcp";
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
