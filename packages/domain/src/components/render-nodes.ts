import { getRegistryDefinition } from "./registry";

/**
 * P0 controlled surfaces expose one manifest root node per instance.
 * The pinned registry uses a single root id per surface for brokered agent tools.
 */
export function primaryRenderNodeId(stableName: string): string {
  if (!getRegistryDefinition(stableName)) {
    return "node_1";
  }
  return "node_1";
}

export function buildRenderNodeSet(stableName: string): { nodeId: string }[] {
  return [{ nodeId: primaryRenderNodeId(stableName) }];
}

export function allowedRenderNodeIds(stableName: string): string[] {
  return [primaryRenderNodeId(stableName)];
}
