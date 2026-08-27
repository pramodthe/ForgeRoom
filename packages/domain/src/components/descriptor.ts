import { createHash } from "node:crypto";
import { canonicalizeJson } from "./jcs";

export type ComponentKind =
  | "metric"
  | "table"
  | "chart"
  | "graph"
  | "timeline"
  | "image"
  | "report"
  | "form"
  | "hitl"
  | "composite";

export type ComponentExposure = "agent_tool" | "server_only";

export type ConfirmationPolicy = "none" | "trusted_host";

export type ComponentDescriptorPreimageV1 = {
  schemaVersion: 1;
  name: string;
  version: string;
  exposure: ComponentExposure;
  kind: ComponentKind;
  modelDescription: string;
  parameterSchema: Record<string, unknown>;
  rendererKey: string;
  previewProps: Record<string, unknown>;
  declaredDataFunctions: string[];
  declaredInteractionIntents: string[];
  confirmation: ConfirmationPolicy;
};

export type ComponentDefinitionInput = Omit<
  ComponentDescriptorPreimageV1,
  "schemaVersion" | "declaredDataFunctions" | "declaredInteractionIntents"
> & {
  declaredDataFunctions: readonly string[];
  declaredInteractionIntents: readonly string[];
};

export type ComponentDefinition = Omit<ComponentDescriptorPreimageV1, "schemaVersion"> & {
  descriptorHash: string;
};

function sortUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function buildComponentDescriptorPreimage(
  def: ComponentDefinitionInput,
): ComponentDescriptorPreimageV1 {
  return {
    schemaVersion: 1,
    name: def.name,
    version: def.version,
    exposure: def.exposure,
    kind: def.kind,
    modelDescription: def.modelDescription,
    parameterSchema: def.parameterSchema,
    rendererKey: def.rendererKey,
    previewProps: def.previewProps,
    declaredDataFunctions: sortUnique(def.declaredDataFunctions),
    declaredInteractionIntents: sortUnique(def.declaredInteractionIntents),
    confirmation: def.confirmation,
  };
}

export function hashComponentDescriptor(preimage: ComponentDescriptorPreimageV1): string {
  const digest = createHash("sha256").update(canonicalizeJson(preimage), "utf8").digest("hex");
  return `sha256:${digest}`;
}

export function assertDescriptorMatches(
  expectedHash: string,
  preimage: ComponentDescriptorPreimageV1,
): { ok: true } | { ok: false; code: "component_version_mismatch" } {
  if (hashComponentDescriptor(preimage) === expectedHash) {
    return { ok: true };
  }
  return { ok: false, code: "component_version_mismatch" };
}

export function componentDefinitionFromPreimage(
  preimage: ComponentDescriptorPreimageV1,
): ComponentDefinition {
  const { schemaVersion: _schemaVersion, ...definition } = preimage;
  return {
    ...definition,
    descriptorHash: hashComponentDescriptor(preimage),
  };
}
