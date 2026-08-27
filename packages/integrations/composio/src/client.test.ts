import { describe, expect, it, vi } from "vitest";
import { ComposioSessionClient } from "./client";
import {
  P0_COMPOSIO_DIRECT_TOOLS,
  P0_COMPOSIO_FORBIDDEN_SURFACES,
} from "./p0-contract";
import { toRedactedSessionEvidence } from "./redact";

function okSessionResponse(overrides: Record<string, unknown> = {}) {
  return {
    session_id: "trs_test_session",
    mcp: {
      type: "http",
      url: "https://backend.composio.dev/tool_router/trs_test_session/mcp",
    },
    tool_router_tools: [...P0_COMPOSIO_DIRECT_TOOLS],
    config: {
      user_id: "forgeroom_workspace_1",
      toolkits: { enabled: ["github"] },
      manage_connections: { enabled: false },
      tools: {
        github: { enabled: [...P0_COMPOSIO_DIRECT_TOOLS] },
      },
      workbench: { enable: false },
      multi_account: { enable: false },
      preload: { tools: [...P0_COMPOSIO_DIRECT_TOOLS] },
      connected_accounts: { github: ["ca_xxxxnizY"] },
      search: { enable: false },
      execute: { enable_multi_execute: false },
    },
    config_version: 1,
    ...overrides,
  };
}

describe("ComposioSessionClient", () => {
  it("creates a direct-tools session with pinned connectedAccounts and no forbidden surfaces", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      expect(body.user_id).toBe("forgeroom_workspace_1");
      expect(body.toolkits).toEqual({ enable: ["github"] });
      expect(body.connected_accounts).toEqual({ github: ["ca_xxxxnizY"] });
      expect(body.manage_connections).toEqual({ enable: false });
      expect(body.workbench).toEqual({ enable: false });
      expect(body.multi_account).toEqual({ enable: false });
      expect(body.search).toEqual({ enable: false });
      expect(body.execute).toEqual({ enable_multi_execute: false });
      expect((body.tools as { github: { enable: string[] } }).github.enable).toEqual([
        ...P0_COMPOSIO_DIRECT_TOOLS,
      ]);
      return new Response(JSON.stringify(okSessionResponse()), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    });

    const client = new ComposioSessionClient({
      apiKey: "test_api_key",
      userId: "forgeroom_workspace_1",
      connectedAccountId: "ca_xxxxnizY",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const session = await client.createDirectToolsSession();
    expect(session.sessionId).toBe("trs_test_session");
    expect([...session.tools].sort()).toEqual([...P0_COMPOSIO_DIRECT_TOOLS].sort());
    expect(session.config.connectedAccounts.github).toEqual(["ca_xxxxnizY"]);
    expect(session.mcp.headers["x-api-key"]).toBe("test_api_key");
    expect(session.mcp.url).toContain("/tool_router/trs_test_session/mcp");

    for (const forbidden of P0_COMPOSIO_FORBIDDEN_SURFACES) {
      expect(session.tools).not.toContain(forbidden);
    }
  });

  it("rejects sessions that expose meta-execute / workbench / search surfaces", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify(
          okSessionResponse({
            tool_router_tools: [
              ...P0_COMPOSIO_DIRECT_TOOLS,
              "COMPOSIO_SEARCH_TOOLS",
              "COMPOSIO_MULTI_EXECUTE_TOOL",
              "COMPOSIO_REMOTE_WORKBENCH",
              "COMPOSIO_REMOTE_BASH_TOOL",
            ],
          }),
        ),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    });

    const client = new ComposioSessionClient({
      apiKey: "test_api_key",
      userId: "forgeroom_workspace_1",
      connectedAccountId: "ca_xxxxnizY",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.createDirectToolsSession()).rejects.toThrow(/forbidden surfaces/);
  });

  it("rejects multi-account pins and enabled forbidden config flags", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify(
          okSessionResponse({
            config: {
              user_id: "forgeroom_workspace_1",
              toolkits: { enabled: ["github"] },
              manage_connections: { enabled: false },
              tools: { github: { enabled: [...P0_COMPOSIO_DIRECT_TOOLS] } },
              workbench: { enable: false },
              multi_account: { enable: false },
              preload: { tools: [...P0_COMPOSIO_DIRECT_TOOLS] },
              connected_accounts: { github: ["ca_one", "ca_two"] },
              search: { enable: false },
              execute: { enable_multi_execute: false },
            },
          }),
        ),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    });

    const client = new ComposioSessionClient({
      apiKey: "test_api_key",
      userId: "forgeroom_workspace_1",
      connectedAccountId: "ca_xxxxnizY",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.createDirectToolsSession()).rejects.toThrow(/exactly one github/);
  });

  it("redacts MCP headers and full account IDs from evidence", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(JSON.stringify(okSessionResponse()), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    });

    const client = new ComposioSessionClient({
      apiKey: "super_secret_api_key",
      userId: "forgeroom_workspace_1",
      connectedAccountId: "ca_xxxxnizY",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const session = await client.createDirectToolsSession();
    const evidence = toRedactedSessionEvidence(session);
    const serialized = JSON.stringify(evidence);
    expect(serialized).not.toContain("super_secret_api_key");
    expect(serialized).not.toContain("ca_xxxxnizY");
    expect(evidence.connectedAccountSuffixes.github).toBe("nizY");
    expect(evidence.mcpUrlHost).toBe("backend.composio.dev");
    expect(evidence.searchEnabled).toBe(false);
    expect(evidence.multiExecuteEnabled).toBe(false);
    expect(evidence.workbenchEnabled).toBe(false);
  });

  it("executes a literal direct tool slug against the pinned account", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toContain("/api/v3.1/tools/execute/GITHUB_GET_AN_ISSUE");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      expect(body.connected_account_id).toBe("ca_xxxxnizY");
      expect(body.user_id).toBe("forgeroom_workspace_1");
      expect(body.arguments).toEqual({
        owner: "pramodthe",
        repo: "ForgeRoom",
        issue_number: 35,
      });
      return new Response(
        JSON.stringify({
          successful: true,
          data: { title: "Fixture", body: "raw-body", number: 35 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const client = new ComposioSessionClient({
      apiKey: "test_api_key",
      userId: "forgeroom_workspace_1",
      connectedAccountId: "ca_xxxxnizY",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.executeDirectTool({
      toolSlug: "GITHUB_GET_AN_ISSUE",
      arguments: { owner: "pramodthe", repo: "ForgeRoom", issue_number: 35 },
    });
    expect(result.toolSlug).toBe("GITHUB_GET_AN_ISSUE");
    expect(result.successful).toBe(true);
    expect(result.authFailure).toBe(false);
    expect(result.httpStatus).toBe(200);
  });
});
