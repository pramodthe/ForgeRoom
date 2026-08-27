import { describe, expect, it } from "vitest";
import {
  assertDescriptorMatches,
  buildComponentDescriptorPreimage,
  hashComponentDescriptor,
  type ComponentDescriptorPreimageV1,
} from "./descriptor";

describe("component descriptor hashing", () => {
  const basePreimage: ComponentDescriptorPreimageV1 = {
    schemaVersion: 1,
    name: "DataTable",
    version: "1.0.0",
    exposure: "agent_tool",
    kind: "table",
    modelDescription: "Render a bounded accessible data table",
    parameterSchema: { type: "object", additionalProperties: false, properties: {} },
    rendererKey: "DataTable@1.0.0",
    previewProps: { caption: "Preview" },
    declaredDataFunctions: ["rows"],
    declaredInteractionIntents: ["sort"],
    confirmation: "none",
  };

  it("produces a stable sha256 descriptor hash", () => {
    const first = hashComponentDescriptor(basePreimage);
    const second = hashComponentDescriptor(basePreimage);
    expect(first).toBe(second);
    expect(first).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("detects descriptor drift", () => {
    const expectedHash = hashComponentDescriptor(basePreimage);
    const drifted = buildComponentDescriptorPreimage({
      ...basePreimage,
      modelDescription: "Changed description",
      declaredDataFunctions: basePreimage.declaredDataFunctions,
      declaredInteractionIntents: basePreimage.declaredInteractionIntents,
    });
    expect(assertDescriptorMatches(expectedHash, drifted)).toEqual({
      ok: false,
      code: "component_version_mismatch",
    });
    expect(assertDescriptorMatches(expectedHash, basePreimage)).toEqual({ ok: true });
  });

  it("sorts and deduplicates declared functions and intents", () => {
    const preimage = buildComponentDescriptorPreimage({
      name: "ChoiceForm",
      version: "1.0.0",
      exposure: "agent_tool",
      kind: "form",
      modelDescription: "Bounded form",
      parameterSchema: { type: "object", additionalProperties: false, properties: {} },
      rendererKey: "ChoiceForm@1.0.0",
      previewProps: {},
      declaredDataFunctions: ["zebra", "alpha", "alpha"],
      declaredInteractionIntents: ["submit", "cancel", "submit"],
      confirmation: "none",
    });
    expect(preimage.declaredDataFunctions).toEqual(["alpha", "zebra"]);
    expect(preimage.declaredInteractionIntents).toEqual(["cancel", "submit"]);
  });
});
