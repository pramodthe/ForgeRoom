import { createHash, randomBytes } from "node:crypto";
import {
  compileP0AgentSpec,
  hashAgentSpec,
  hashApprovalPolicy,
  type TrueForgeAgentSpec,
  type TrueForgeMcpServerRef,
} from "@forgeroom/trueforge";
import { isUiComponentsMcpConnectorName } from "@forgeroom/ui-components-mcp";

export type SessionRevisionSnapshotInput = {
  coworker: {
    id: string;
    handle: string;
    name: string;
    title: string;
    configRevision: number;
    standingInstructions?: string;
    modelPreset: string;
    sandboxEnabled: boolean;
  };
  channelId: string;
  workspaceId: string;
  connectors?: Array<{
    name: string;
    enabledTools: string[];
    approvalRequiredTools: string[];
  }>;
  /** Controlled-component tool names offered after grant intersection. */
  componentToolNames?: string[];
  /** Per-generation TrueForge MCP connector name for component tools. */
  uiComponentsMcpConnectorName?: string;
  skillNames?: string[];
  /**
   * Monotonic SessionRevision ordinal. Defaults to coworker.configRevision.
   * Rotation must supply max(existing)+1 when coworker config_revision is unchanged.
   */
  sourceConfigRevision?: number;
  createdBy: string;
};

export type CompiledSessionRevision = {
  id: string;
  agentProfileId: string;
  sourceConfigRevision: number;
  effectiveConfigRedacted: Record<string, unknown>;
  effectiveSpecHash: string;
  approvalPolicyHash: string;
  agentSpec: TrueForgeAgentSpec;
  createdBy: string;
  createdAt: string;
};

function opaqueId(prefix: string): string {
  return `${prefix}_${randomBytes(10).toString("hex")}`;
}

export const P0_UI_COMPONENTS_MCP_CONNECTOR_NAME = "ui_components_v1" as const;

function withComponentToolsMcpServer(
  spec: TrueForgeAgentSpec,
  componentToolNames: readonly string[],
  connectorName: string,
): TrueForgeAgentSpec {
  if (componentToolNames.length === 0) {
    return spec;
  }
  const componentServer: TrueForgeMcpServerRef = {
    name: connectorName,
    enable_tools: [...componentToolNames],
    require_approval_for_tools: ["@write", "@destructive"],
    preload: false,
  };
  const existing = (spec.mcp_servers ?? []).filter(
    (server) => !isUiComponentsMcpConnectorName(server.name),
  );
  return {
    ...spec,
    mcp_servers: [...existing, componentServer],
  };
}

/** Snapshot coworker/channel grants into an immutable SessionRevision + P0 AgentSpec. */
export function compileSessionRevision(
  input: SessionRevisionSnapshotInput,
  now = new Date().toISOString(),
): CompiledSessionRevision {
  const componentToolNames = input.componentToolNames ?? [];
  const uiComponentsMcpConnectorName =
    componentToolNames.length > 0
      ? (input.uiComponentsMcpConnectorName ?? P0_UI_COMPONENTS_MCP_CONNECTOR_NAME)
      : undefined;
  const baseSpec = compileP0AgentSpec({
    modelPreset: input.coworker.modelPreset,
    instructions: input.coworker.standingInstructions,
    sandboxEnabled: input.coworker.sandboxEnabled,
    connectors: input.connectors,
    skillNames: input.skillNames,
  });
  const agentSpec = withComponentToolsMcpServer(
    baseSpec,
    componentToolNames,
    uiComponentsMcpConnectorName ?? P0_UI_COMPONENTS_MCP_CONNECTOR_NAME,
  );

  const effectiveConfigRedacted = {
    coworker: {
      id: input.coworker.id,
      handle: input.coworker.handle,
      name: input.coworker.name,
      title: input.coworker.title,
      config_revision: input.coworker.configRevision,
      model_preset: input.coworker.modelPreset,
      sandbox_enabled: input.coworker.sandboxEnabled,
      native_subagents_enabled: false,
    },
    channel_id: input.channelId,
    workspace_id: input.workspaceId,
    connectors: (input.connectors ?? []).map((connector) => ({
      name: connector.name,
      enabled_tools: connector.enabledTools,
      approval_required_tools: connector.approvalRequiredTools,
    })),
    component_tool_names: componentToolNames,
    skill_names: input.skillNames ?? [],
    compiled_flags: {
      dynamic_sub_agents: false,
      generative_ui: false,
      iframe_v1: false,
      coordinator_planning: false,
    },
    agent_spec: agentSpec,
  };

  return {
    id: opaqueId("sr"),
    agentProfileId: input.coworker.id,
    sourceConfigRevision: input.sourceConfigRevision ?? input.coworker.configRevision,
    effectiveConfigRedacted,
    effectiveSpecHash: hashAgentSpec(agentSpec),
    approvalPolicyHash: hashApprovalPolicy(agentSpec),
    agentSpec,
    createdBy: input.createdBy,
    createdAt: now,
  };
}

export function fingerprintRevisionConfig(config: Record<string, unknown>): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(config)).digest("hex")}`;
}
