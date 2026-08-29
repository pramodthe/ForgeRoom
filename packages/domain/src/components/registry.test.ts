import { componentVersionSchema, p0ComponentNameSchema } from "@forgeroom/contracts";
import { describe, expect, it } from "vitest";
import { buildComponentDescriptorPreimage, hashComponentDescriptor } from "./descriptor";
import {
  getRegistryDefinition,
  listAgentToolDefinitions,
  listServerOnlyDefinitions,
  P0_CONTROLLED_REGISTRY,
} from "./registry";

describe("P0 controlled component registry", () => {
  it("contains eight eagerly sorted entries", () => {
    expect(P0_CONTROLLED_REGISTRY).toHaveLength(8);
    const names = P0_CONTROLLED_REGISTRY.map((definition) => definition.name);
    expect(names).toEqual([
      "ApprovalCard",
      "ArtifactCard",
      "BarOrLineChart",
      "ChoiceForm",
      "ConnectionCard",
      "DataTable",
      "RequiredQuestionCard",
      "TaskCard",
    ]);
    expect([...names].sort((left, right) => left.localeCompare(right))).toEqual(names);
  });

  it("separates agent tools from server-only HITL cards", () => {
    expect(listAgentToolDefinitions()).toHaveLength(5);
    expect(listServerOnlyDefinitions()).toHaveLength(3);
    expect(
      listAgentToolDefinitions().every((definition) => definition.exposure === "agent_tool"),
    ).toBe(true);
    expect(
      listServerOnlyDefinitions().every((definition) => definition.exposure === "server_only"),
    ).toBe(true);
    for (const hitlName of ["ApprovalCard", "RequiredQuestionCard", "ConnectionCard"]) {
      expect(listAgentToolDefinitions().some((definition) => definition.name === hitlName)).toBe(
        false,
      );
    }
  });

  it("recomputes descriptor hashes from the canonical preimage", () => {
    for (const definition of P0_CONTROLLED_REGISTRY) {
      const preimage = buildComponentDescriptorPreimage(definition);
      expect(definition.descriptorHash).toBe(hashComponentDescriptor(preimage));
    }
  });

  it("publishes closed nested schemas for renderer-owned arrays", () => {
    const propertiesFor = (name: string) =>
      (
        getRegistryDefinition(name)?.parameterSchema as {
          properties?: Record<string, unknown>;
        }
      ).properties ?? {};
    const dataTableColumns = propertiesFor("DataTable").columns as Record<string, unknown>;
    const chartSeries = propertiesFor("BarOrLineChart").series as Record<string, unknown>;
    const choiceFields = propertiesFor("ChoiceForm").fields as Record<string, unknown>;

    expect(dataTableColumns).toMatchObject({
      maxItems: 12,
      items: { additionalProperties: false, required: ["key", "label"] },
    });
    expect(chartSeries).toMatchObject({
      maxItems: 8,
      items: { additionalProperties: false, required: ["key", "label"] },
    });
    expect(choiceFields).toMatchObject({
      maxItems: 12,
      items: {
        additionalProperties: false,
        required: ["id", "label", "kind", "required"],
      },
    });
  });

  it("looks up definitions by stable name", () => {
    expect(getRegistryDefinition("DataTable")?.name).toBe("DataTable");
    expect(getRegistryDefinition("MissingComponent")).toBeUndefined();
  });

  it("validates agent tool manifests against componentVersionSchema", () => {
    for (const [index, definition] of listAgentToolDefinitions().entries()) {
      expect(p0ComponentNameSchema.safeParse(definition.name).success).toBe(true);
      const parsed = componentVersionSchema.safeParse({
        schemaVersion: 1,
        id: `componentv_${definition.name.toLowerCase()}`,
        stable_name: definition.name,
        semantic_version: definition.version,
        kind: definition.kind,
        exposure: definition.exposure,
        confirmation_policy: definition.confirmation,
        model_description: definition.modelDescription,
        argument_schema: definition.parameterSchema,
        renderer_key: definition.rendererKey,
        preview_props: definition.previewProps,
        descriptor_hash: definition.descriptorHash,
        declared_data_functions: definition.declaredDataFunctions,
        declared_interaction_intents: definition.declaredInteractionIntents,
      });
      expect(parsed.success, `agent tool ${definition.name} at index ${index}`).toBe(true);
    }
  });
});
