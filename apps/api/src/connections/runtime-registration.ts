import {
  P0_COMPOSIO_ENABLED_TOOLS,
  P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME,
  type ComposioHostedSession,
} from "@forgeroom/composio";
import type { TrueForgeMcpTool } from "@forgeroom/trueforge";

export type ComposioRuntimeSessionClient = {
  createDirectToolsSession(): Promise<ComposioHostedSession>;
};

export type TrueForgeRuntimeMcpClient = {
  registerHeaderAuthMcpServer(input: {
    name: string;
    url: string;
    description: string;
    headers: Record<string, string>;
  }): Promise<unknown>;
  listMcpServerTools(name: string): Promise<TrueForgeMcpTool[]>;
};

/** Register the exact hosted Composio direct-tool surface in TrueForge, fail closed on drift. */
export async function registerP0ComposioRuntimeConnector(input: {
  composio: ComposioRuntimeSessionClient;
  trueforge: TrueForgeRuntimeMcpClient;
}): Promise<{ connectorName: string; toolNames: string[] }> {
  const session = await input.composio.createDirectToolsSession();
  await input.trueforge.registerHeaderAuthMcpServer({
    name: P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME,
    url: session.mcp.url,
    description: "ForgeRoom P0 pinned Composio GitHub direct tools",
    headers: { ...session.mcp.headers },
  });
  const tools = await input.trueforge.listMcpServerTools(P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME);
  const observed = [...new Set(tools.map((tool) => tool.name))].sort();
  const expected = [...P0_COMPOSIO_ENABLED_TOOLS].sort();
  if (JSON.stringify(observed) !== JSON.stringify(expected)) {
    throw new Error("TrueForge Composio connector tool surface does not match the P0 allowlist");
  }
  return { connectorName: P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME, toolNames: observed };
}
