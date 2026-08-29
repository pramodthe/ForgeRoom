import { describe, expect, it, vi } from "vitest";
import {
  compileP0AgentSpec,
  hashApprovalPolicy,
  mcpToolNames,
  registerHeaderAuthMcpServer,
  verifyCompiledAgentSpecPolicy,
} from "./index";
import { TrueForgeClient } from "./client";

describe("registerHeaderAuthMcpServer", () => {
  it("PUTs a header-auth MCP manifest and returns redacted auth_status", async () => {
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      expect(String(input)).toBe("http://trueforge.test/api/v1/settings/mcp-servers");
      expect(init?.method).toBe("PUT");
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        manifest: { name: string; auth: { type: string; headers: Record<string, string> } };
      };
      expect(body.manifest.name).toBe("composio_github");
      expect(body.manifest.auth.type).toBe("header");
      expect(body.manifest.auth.headers["x-api-key"]).toBe("secret_key");
      return new Response(
        JSON.stringify({
          data: {
            name: "composio_github",
            manifest: {
              type: "remote",
              name: "composio_github",
              url: "https://backend.composio.dev/tool_router/trs_x/mcp",
              description: "ForgeRoom Composio direct tools",
              auth: { type: "header", headers: { "x-api-key": "***REDACTED***" } },
            },
            auth_status: { status: "authenticated" },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const client = new TrueForgeClient({
      baseUrl: "http://trueforge.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const configured = await client.registerHeaderAuthMcpServer({
      name: "composio_github",
      url: "https://backend.composio.dev/tool_router/trs_x/mcp",
      description: "ForgeRoom Composio direct tools",
      headers: { "x-api-key": "secret_key" },
    });

    expect(configured.name).toBe("composio_github");
    expect(configured.auth_status.status).toBe("authenticated");
    expect(configured.manifest.auth?.headers["x-api-key"]).toContain("REDACTED");
  });

  it("DELETEs a configured MCP connector by name", async () => {
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      expect(String(input)).toBe(
        "http://trueforge.test/api/v1/settings/mcp-servers/ui_components_v1__gen_1",
      );
      expect(init?.method).toBe("DELETE");
      return new Response(null, { status: 204 });
    });

    const client = new TrueForgeClient({
      baseUrl: "http://trueforge.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.deleteHeaderAuthMcpServer("ui_components_v1__gen_1");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("treats an already-absent MCP connector as successfully deleted", async () => {
    const client = new TrueForgeClient({
      baseUrl: "http://trueforge.test",
      fetchImpl: (async () =>
        new Response(JSON.stringify({ error: { message: "connector not found" } }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })) as unknown as typeof fetch,
    });

    await expect(
      client.deleteHeaderAuthMcpServer("ui_components_v1__already_gone"),
    ).resolves.toBeUndefined();
  });

  it("lists connector tool names for allowlist comparison", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          data: [
            { name: "GITHUB_GET_AN_ISSUE", inputSchema: { type: "object" } },
            { name: "GITHUB_ADD_LABELS_TO_AN_ISSUE" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const client = new TrueForgeClient({
      baseUrl: "http://trueforge.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const tools = await client.listMcpServerTools("composio_github");
    expect(mcpToolNames(tools)).toEqual(["GITHUB_GET_AN_ISSUE", "GITHUB_ADD_LABELS_TO_AN_ISSUE"]);
  });

  it("rejects empty header maps via the standalone helper", async () => {
    await expect(
      registerHeaderAuthMcpServer(
        {
          requestJson: async <T>() => {
            return {} as T;
          },
        },
        {
          name: "composio_github",
          url: "https://example.test/mcp",
          description: "x",
          headers: {},
        },
      ),
    ).rejects.toThrow(/at least one header/);
  });
});

describe("verifyCompiledAgentSpecPolicy", () => {
  const enabled = [
    "GITHUB_GET_AN_ISSUE",
    "GITHUB_ADD_LABELS_TO_AN_ISSUE",
    "GITHUB_REMOVE_A_LABEL_FROM_AN_ISSUE",
  ];
  const approval = ["GITHUB_ADD_LABELS_TO_AN_ISSUE", "GITHUB_REMOVE_A_LABEL_FROM_AN_ISSUE"];

  it("accepts a compiled P0 AgentSpec matching frozen enable/approval sets", () => {
    const spec = compileP0AgentSpec({
      modelPreset: "openai/gpt-5-4-mini",
      sandboxEnabled: false,
      connectors: [
        {
          name: "composio_github",
          enabledTools: enabled,
          approvalRequiredTools: approval,
        },
      ],
    });
    const findings = verifyCompiledAgentSpecPolicy(spec, {
      connectorName: "composio_github",
      enabledTools: enabled,
      approvalRequiredTools: approval,
      approvalPolicyHash: hashApprovalPolicy(spec),
    });
    expect(findings).toEqual([]);
  });

  it("fails closed when an approval rule is lost", () => {
    const spec = compileP0AgentSpec({
      modelPreset: "openai/gpt-5-4-mini",
      sandboxEnabled: false,
      connectors: [
        {
          name: "composio_github",
          enabledTools: enabled,
          approvalRequiredTools: ["GITHUB_ADD_LABELS_TO_AN_ISSUE"],
        },
      ],
    });
    const findings = verifyCompiledAgentSpecPolicy(spec, {
      connectorName: "composio_github",
      enabledTools: enabled,
      approvalRequiredTools: approval,
    });
    expect(findings.some((row) => row.kind === "lost_approval_rule")).toBe(true);
  });

  it("keeps explicit Code Mode connector writes behind write approval", () => {
    const spec = compileP0AgentSpec({
      modelPreset: "openai/gpt-5-4-mini",
      sandboxEnabled: true,
      connectors: [
        {
          name: "composio_github",
          enabledTools: enabled,
          approvalRequiredTools: approval,
        },
      ],
    });

    expect(spec.config.sandbox).toMatchObject({ enabled: true });
    expect(spec.mcp_servers?.[0]?.require_approval_for_tools).toEqual(
      expect.arrayContaining(approval),
    );
    expect(
      verifyCompiledAgentSpecPolicy(spec, {
        connectorName: "composio_github",
        enabledTools: enabled,
        approvalRequiredTools: approval,
      }),
    ).toEqual([]);

    const missingWriteApproval = {
      ...spec,
      mcp_servers: spec.mcp_servers?.map((server) => ({
        ...server,
        require_approval_for_tools: server.require_approval_for_tools.filter(
          (toolName) => toolName !== "GITHUB_REMOVE_A_LABEL_FROM_AN_ISSUE",
        ),
      })),
    };
    expect(
      verifyCompiledAgentSpecPolicy(missingWriteApproval, {
        connectorName: "composio_github",
        enabledTools: enabled,
        approvalRequiredTools: approval,
      }).some((finding) => finding.kind === "lost_approval_rule"),
    ).toBe(true);
  });

  it("fails closed when an unexpected tool enters the allowlist", () => {
    const spec = compileP0AgentSpec({
      modelPreset: "openai/gpt-5-4-mini",
      sandboxEnabled: false,
      connectors: [
        {
          name: "composio_github",
          enabledTools: [...enabled, "GITHUB_CREATE_AN_ISSUE"],
          approvalRequiredTools: approval,
        },
      ],
    });
    const findings = verifyCompiledAgentSpecPolicy(spec, {
      connectorName: "composio_github",
      enabledTools: enabled,
      approvalRequiredTools: approval,
    });
    expect(findings.some((row) => row.kind === "unexpected_enabled_tool")).toBe(true);
  });
});
