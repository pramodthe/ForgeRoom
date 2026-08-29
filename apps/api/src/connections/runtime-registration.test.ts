import { describe, expect, it, vi } from "vitest";
import {
  P0_COMPOSIO_ENABLED_TOOLS,
  P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME,
} from "@forgeroom/composio";
import { registerP0ComposioRuntimeConnector } from "./runtime-registration";

function session() {
  return {
    sessionId: "session-1",
    tools: [...P0_COMPOSIO_ENABLED_TOOLS],
    config: {
      userId: "service-user",
      toolkits: { enabled: ["github"] },
      tools: { github: { enabled: [...P0_COMPOSIO_ENABLED_TOOLS] } },
      connectedAccounts: { github: ["account-1"] },
      manageConnections: { enabled: false },
      workbench: { enable: false },
      multiAccount: { enable: false },
      search: { enable: false },
      execute: { enableMultiExecute: false },
      preloadTools: [...P0_COMPOSIO_ENABLED_TOOLS],
    },
    configVersion: 1,
    mcp: {
      type: "http" as const,
      url: "https://example.test/mcp",
      headers: { authorization: "secret" },
    },
  };
}

describe("registerP0ComposioRuntimeConnector", () => {
  it("registers server-side MCP credentials and verifies the exact tool surface", async () => {
    const registerHeaderAuthMcpServer = vi.fn(async () => ({}));
    const result = await registerP0ComposioRuntimeConnector({
      composio: { createDirectToolsSession: vi.fn(async () => session()) },
      trueforge: {
        registerHeaderAuthMcpServer,
        listMcpServerTools: vi.fn(async () => P0_COMPOSIO_ENABLED_TOOLS.map((name) => ({ name }))),
      },
    });
    expect(result.connectorName).toBe(P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME);
    expect(registerHeaderAuthMcpServer).toHaveBeenCalledWith(
      expect.objectContaining({ name: P0_COMPOSIO_TRUEFORGE_CONNECTOR_NAME }),
    );
  });

  it("fails closed when TrueForge reports an expanded tool surface", async () => {
    await expect(
      registerP0ComposioRuntimeConnector({
        composio: { createDirectToolsSession: vi.fn(async () => session()) },
        trueforge: {
          registerHeaderAuthMcpServer: vi.fn(async () => ({})),
          listMcpServerTools: vi.fn(async () => [
            ...P0_COMPOSIO_ENABLED_TOOLS.map((name) => ({ name })),
            { name: "GITHUB_DELETE_A_REPOSITORY" },
          ]),
        },
      }),
    ).rejects.toThrow(/does not match/);
  });
});
