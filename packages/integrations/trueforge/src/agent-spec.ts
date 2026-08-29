import { createHash } from "node:crypto";
import type { TrueForgeAgentSpec, TrueForgeMcpServerRef, TrueForgeSkillRef } from "./types";

export type CompileP0AgentSpecInput = {
  modelPreset: string;
  instructions?: string;
  sandboxEnabled: boolean;
  /** Confirmed TrueForge connector names only. */
  connectors?: Array<{
    name: string;
    enabledTools: string[];
    approvalRequiredTools: string[];
  }>;
  /** Exact immutable skill package names. */
  skillNames?: string[];
  iterationLimit?: number;
};

const FORBIDDEN_CAPABILITY_MARKERS = [
  "native_subagent",
  "dynamic_sub_agents",
  "coordinator",
  "iframe_v1",
  "generate_open_ui",
] as const;

function assertNoForbiddenMarkers(value: unknown, path: string): void {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    for (const marker of FORBIDDEN_CAPABILITY_MARKERS) {
      if (marker === "dynamic_sub_agents") {
        continue;
      }
      if (lower.includes(marker)) {
        throw new Error(`P0 AgentSpec forbids capability marker "${marker}" at ${path}`);
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenMarkers(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      assertNoForbiddenMarkers(child, `${path}.${key}`);
    }
  }
}

/** Compile an immutable P0 TrueForge AgentSpec (native subagents / iframe off). */
export function compileP0AgentSpec(input: CompileP0AgentSpecInput): TrueForgeAgentSpec {
  if (!input.modelPreset.trim()) {
    throw new Error("modelPreset is required");
  }

  const mcpServers: TrueForgeMcpServerRef[] = (input.connectors ?? []).map((connector) => ({
    name: connector.name,
    enable_tools: [...connector.enabledTools],
    require_approval_for_tools:
      connector.approvalRequiredTools.length > 0
        ? [...connector.approvalRequiredTools]
        : ["@write", "@destructive"],
    preload: false,
  }));

  const skills: TrueForgeSkillRef[] = (input.skillNames ?? []).map((name) => ({ name }));

  const spec: TrueForgeAgentSpec = {
    model: { name: input.modelPreset },
    ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
    ...(mcpServers.length > 0 ? { mcp_servers: mcpServers } : {}),
    ...(skills.length > 0 ? { skills } : {}),
    config: {
      ...(input.iterationLimit !== undefined ? { iteration_limit: input.iterationLimit } : {}),
      sandbox: {
        enabled: input.sandboxEnabled,
        file_downloads: true,
      },
      dynamic_sub_agents: { enabled: false },
      generative_ui: { enabled: false },
      ask_user_questions: { enabled: false },
    },
  };

  assertNoForbiddenMarkers(
    {
      model: spec.model,
      instructions: spec.instructions,
      mcp_servers: spec.mcp_servers,
      skills: spec.skills,
    },
    "spec",
  );

  if (spec.config.dynamic_sub_agents.enabled !== false) {
    throw new Error("P0 AgentSpec must set dynamic_sub_agents.enabled=false");
  }
  if (spec.config.generative_ui.enabled !== false) {
    throw new Error("P0 AgentSpec must set generative_ui.enabled=false (iframe_v1 disabled)");
  }

  return spec;
}

export function hashAgentSpec(spec: TrueForgeAgentSpec): string {
  return `sha256:${createHash("sha256").update(stableStringify(spec)).digest("hex")}`;
}

export function hashApprovalPolicy(spec: TrueForgeAgentSpec): string {
  const policy = {
    mcp_servers: (spec.mcp_servers ?? []).map((server) => ({
      name: server.name,
      require_approval_for_tools: server.require_approval_for_tools,
    })),
    dynamic_sub_agents: spec.config.dynamic_sub_agents,
    generative_ui: spec.config.generative_ui,
  };
  return `sha256:${createHash("sha256").update(stableStringify(policy)).digest("hex")}`;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}
