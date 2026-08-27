import { createHash, randomBytes } from "node:crypto";
import {
  compileP0AgentSpec,
  hashAgentSpec,
  hashApprovalPolicy,
  type TrueForgeAgentSpec,
} from "@forgeroom/trueforge";

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
  skillNames?: string[];
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

/** Snapshot coworker/channel grants into an immutable SessionRevision + P0 AgentSpec. */
export function compileSessionRevision(
  input: SessionRevisionSnapshotInput,
  now = new Date().toISOString(),
): CompiledSessionRevision {
  const agentSpec = compileP0AgentSpec({
    modelPreset: input.coworker.modelPreset,
    instructions: input.coworker.standingInstructions,
    sandboxEnabled: input.coworker.sandboxEnabled,
    connectors: input.connectors,
    skillNames: input.skillNames,
  });

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
    sourceConfigRevision: input.coworker.configRevision,
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
