import type { TrueForgeClient } from "@forgeroom/trueforge";
import {
  P0_UI_COMPONENTS_MCP_CONNECTOR_NAME,
  P0_UI_COMPONENTS_MCP_CONNECTOR_PREFIX,
  P0_UI_COMPONENTS_MCP_HEADER_NAME,
  buildUiComponentsMcpConnectorName,
  buildUiComponentsMcpSessionUrl,
} from "./constants";
import { deriveUiComponentsMcpSecret } from "./credentials";

export async function registerUiComponentsMcpServer(
  client: Pick<TrueForgeClient, "registerHeaderAuthMcpServer">,
  input: {
    appOrigin: string;
    generationId: string;
    masterSecret: string;
  },
): Promise<void> {
  await client.registerHeaderAuthMcpServer({
    name: buildUiComponentsMcpConnectorName(input.generationId),
    url: buildUiComponentsMcpSessionUrl(input.appOrigin, input.generationId),
    description: "ForgeRoom controlled registry component render tools",
    headers: {
      [P0_UI_COMPONENTS_MCP_HEADER_NAME]: deriveUiComponentsMcpSecret(
        input.masterSecret,
        input.generationId,
      ),
    },
  });
}

export async function unregisterUiComponentsMcpServer(
  client: Pick<TrueForgeClient, "deleteHeaderAuthMcpServer">,
  input: { generationId: string },
): Promise<void> {
  await client.deleteHeaderAuthMcpServer(buildUiComponentsMcpConnectorName(input.generationId));
}

export {
  P0_UI_COMPONENTS_MCP_CONNECTOR_NAME,
  P0_UI_COMPONENTS_MCP_CONNECTOR_PREFIX,
  P0_UI_COMPONENTS_MCP_HEADER_NAME,
  buildUiComponentsMcpConnectorName,
  buildUiComponentsMcpSessionUrl,
};
