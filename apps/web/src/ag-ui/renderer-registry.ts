import {
  P0_AGENT_TOOL_COMPONENT_NAMES,
  presentToolCall,
  presentUnsupportedCapability,
  presentUnknownActivity,
  type ActivityPresentation,
} from "@forgeroom/ui-components";

const AGENT_TOOL_NAME_SET = new Set<string>(P0_AGENT_TOOL_COMPONENT_NAMES);

const FORBIDDEN_OPEN_UI_TOOLS = new Set([
  "generate_open_ui",
  "iframe_v1",
  "open_generated_ui",
  "OpenGeneratedUi",
]);

export type ToolRendererResolution =
  | {
      kind: "named";
      toolName: string;
      presentation: ActivityPresentation;
    }
  | {
      kind: "inert";
      toolName: string;
      presentation: ActivityPresentation;
    };

/**
 * Stable application renderer registry for backend/tool cards on the channel timeline.
 * Reviewed P0 agent-tool names use named renderers; everything else fails closed to inert.
 */
export function resolveBackendToolRenderer(input: {
  toolName: string;
  status: "running" | "complete";
}): ToolRendererResolution {
  if (FORBIDDEN_OPEN_UI_TOOLS.has(input.toolName)) {
    return {
      kind: "inert",
      toolName: input.toolName,
      presentation: presentUnsupportedCapability(
        "Open generated UI and iframe_v1 tool calls are unavailable in P0.",
      ),
    };
  }

  if (AGENT_TOOL_NAME_SET.has(input.toolName)) {
    return {
      kind: "named",
      toolName: input.toolName,
      presentation: {
        ...presentToolCall({ toolName: input.toolName, status: input.status }),
        eyebrow: "Reviewed component",
        detail:
          input.status === "complete"
            ? "Registered controlled component tool"
            : "Registered controlled component tool starting",
      },
    };
  }

  if (input.toolName.trim().length === 0) {
    return {
      kind: "inert",
      toolName: input.toolName,
      presentation: presentUnknownActivity(),
    };
  }

  return {
    kind: "inert",
    toolName: input.toolName,
    presentation: {
      ...presentToolCall({ toolName: input.toolName, status: input.status }),
      eyebrow: "Tool",
      detail: "Unknown tool — rendered with the inert default",
      tone: "neutral",
      inert: true,
    },
  };
}

export function isRegisteredAgentToolComponent(name: string): boolean {
  return AGENT_TOOL_NAME_SET.has(name);
}
