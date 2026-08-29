import {
  buildComponentDescriptorPreimage,
  componentDefinitionFromPreimage,
  type ComponentDefinition,
  type ComponentDefinitionInput,
} from "./descriptor";

const VERSION = "1.0.0";

const closedObjectSchema = {
  type: "object",
  additionalProperties: false,
  properties: {},
} as const;

function defineComponent(def: ComponentDefinitionInput): ComponentDefinition {
  return componentDefinitionFromPreimage(buildComponentDescriptorPreimage(def));
}

const APPROVAL_CARD = defineComponent({
  name: "ApprovalCard",
  version: VERSION,
  exposure: "server_only",
  kind: "hitl",
  modelDescription: "Trusted host approval card for canonical pause actions",
  parameterSchema: closedObjectSchema,
  rendererKey: "ApprovalCard@1.0.0",
  previewProps: {},
  declaredDataFunctions: ["approval"],
  declaredInteractionIntents: ["approve", "deny"],
  confirmation: "trusted_host",
});

const ARTIFACT_CARD = defineComponent({
  name: "ArtifactCard",
  version: VERSION,
  exposure: "agent_tool",
  kind: "report",
  modelDescription: "Render a bounded artifact summary card from granted artifact snapshots",
  parameterSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      heading: { type: "string" },
      show_preview: { type: "boolean" },
      show_source: { type: "boolean" },
      download_label: { type: "string" },
    },
    required: ["heading", "show_preview", "show_source", "download_label"],
  },
  rendererKey: "ArtifactCard@1.0.0",
  previewProps: {
    heading: "Sandbox summary",
    show_preview: true,
    show_source: true,
    download_label: "Download",
  },
  declaredDataFunctions: ["artifact"],
  declaredInteractionIntents: ["download"],
  confirmation: "none",
});

const BAR_OR_LINE_CHART = defineComponent({
  name: "BarOrLineChart",
  version: VERSION,
  exposure: "agent_tool",
  kind: "chart",
  modelDescription: "A bounded accessible bar or line chart from granted series snapshots",
  parameterSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      description: { type: ["string", "null"] },
      chart_type: { type: "string", enum: ["bar", "line"] },
      x_axis_label: { type: "string" },
      y_axis_label: { type: "string" },
      series: {
        type: "array",
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            key: { type: "string" },
            label: { type: "string" },
          },
          required: ["key", "label"],
        },
      },
      accessible_table_caption: { type: "string" },
    },
    required: [
      "title",
      "chart_type",
      "x_axis_label",
      "y_axis_label",
      "series",
      "accessible_table_caption",
    ],
  },
  rendererKey: "BarOrLineChart@1.0.0",
  previewProps: {
    title: "Synthetic record counts",
    description: "Bounded bar chart for the demo read path.",
    chart_type: "bar",
    x_axis_label: "Status",
    y_axis_label: "Count",
    series: [{ key: "count", label: "Records" }],
    accessible_table_caption: "Record counts by status",
  },
  declaredDataFunctions: ["series"],
  declaredInteractionIntents: ["select"],
  confirmation: "none",
});

const CHOICE_FORM = defineComponent({
  name: "ChoiceForm",
  version: VERSION,
  exposure: "agent_tool",
  kind: "form",
  modelDescription: "Render a bounded choice form for local filtering and selection",
  parameterSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      description: { type: ["string", "null"] },
      submit_label: { type: "string" },
      cancel_label: { type: "string" },
      fields: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            description: { type: ["string", "null"] },
            kind: { type: "string", enum: ["single_choice", "checkbox"] },
            required: { type: "boolean" },
            options: {
              type: "array",
              maxItems: 20,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  label: { type: "string" },
                  description: { type: ["string", "null"] },
                },
                required: ["id", "label"],
              },
            },
          },
          required: ["id", "label", "kind", "required"],
        },
      },
    },
    required: ["title", "submit_label", "cancel_label", "fields"],
  },
  rendererKey: "ChoiceForm@1.0.0",
  previewProps: {
    title: "Filter synthetic records",
    description: "Bounded local filter only — no external mutation.",
    submit_label: "Apply filter",
    cancel_label: "Reset",
    fields: [
      {
        id: "status_filter",
        label: "Status",
        description: "Show records with this status",
        required: true,
        kind: "single_choice",
        options: [
          { id: "open", label: "Open", description: null },
          { id: "ready", label: "Ready", description: null },
          { id: "all", label: "All", description: null },
        ],
      },
      {
        id: "include_owner",
        label: "Show owner column",
        description: null,
        required: false,
        kind: "checkbox",
      },
    ],
  },
  declaredDataFunctions: [],
  declaredInteractionIntents: ["submit"],
  confirmation: "none",
});

const CONNECTION_CARD = defineComponent({
  name: "ConnectionCard",
  version: VERSION,
  exposure: "server_only",
  kind: "hitl",
  modelDescription: "Trusted host connection authorization card",
  parameterSchema: closedObjectSchema,
  rendererKey: "ConnectionCard@1.0.0",
  previewProps: {},
  declaredDataFunctions: ["connection"],
  declaredInteractionIntents: ["connect", "cancel"],
  confirmation: "trusted_host",
});

const DATA_TABLE = defineComponent({
  name: "DataTable",
  version: VERSION,
  exposure: "agent_tool",
  kind: "table",
  modelDescription: "Render a bounded accessible data table from granted row snapshots",
  parameterSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      caption: { type: "string" },
      description: { type: ["string", "null"] },
      empty_text: { type: "string" },
      columns: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            key: { type: "string" },
            label: { type: "string" },
            align: { type: "string", enum: ["start", "center", "end"] },
          },
          required: ["key", "label"],
        },
      },
    },
    required: ["caption", "empty_text", "columns"],
  },
  rendererKey: "DataTable@1.0.0",
  previewProps: {
    caption: "Synthetic demo records",
    description: "Public/synthetic Composio read projected into the controlled table.",
    empty_text: "No synthetic records",
    columns: [
      { key: "record_id", label: "Record", align: "start" },
      { key: "status", label: "Status", align: "start" },
      { key: "owner", label: "Owner", align: "start" },
    ],
  },
  declaredDataFunctions: ["rows"],
  declaredInteractionIntents: ["sort", "filter"],
  confirmation: "none",
});

const REQUIRED_QUESTION_CARD = defineComponent({
  name: "RequiredQuestionCard",
  version: VERSION,
  exposure: "server_only",
  kind: "hitl",
  modelDescription: "Trusted host required question card for canonical pause actions",
  parameterSchema: closedObjectSchema,
  rendererKey: "RequiredQuestionCard@1.0.0",
  previewProps: {},
  declaredDataFunctions: ["question"],
  declaredInteractionIntents: ["answer"],
  confirmation: "trusted_host",
});

const TASK_CARD = defineComponent({
  name: "TaskCard",
  version: VERSION,
  exposure: "agent_tool",
  kind: "report",
  modelDescription: "Render a bounded task summary card from granted task snapshots",
  parameterSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      heading: { type: "string" },
      show_description: { type: "boolean" },
      show_assignee: { type: "boolean" },
      show_due_date: { type: "boolean" },
      show_history: { type: "boolean" },
    },
    required: ["heading", "show_description", "show_assignee", "show_due_date", "show_history"],
  },
  rendererKey: "TaskCard@1.0.0",
  previewProps: {
    heading: "Demo Task",
    show_description: true,
    show_assignee: true,
    show_due_date: false,
    show_history: true,
  },
  declaredDataFunctions: ["task"],
  declaredInteractionIntents: [],
  confirmation: "none",
});

const REGISTRY_ENTRIES: ComponentDefinition[] = [
  APPROVAL_CARD,
  ARTIFACT_CARD,
  BAR_OR_LINE_CHART,
  CHOICE_FORM,
  CONNECTION_CARD,
  DATA_TABLE,
  REQUIRED_QUESTION_CARD,
  TASK_CARD,
];

export const P0_CONTROLLED_REGISTRY: readonly ComponentDefinition[] = [...REGISTRY_ENTRIES].sort(
  (left, right) => left.name.localeCompare(right.name),
);

export function listAgentToolDefinitions(): readonly ComponentDefinition[] {
  return P0_CONTROLLED_REGISTRY.filter((definition) => definition.exposure === "agent_tool");
}

export function listServerOnlyDefinitions(): readonly ComponentDefinition[] {
  return P0_CONTROLLED_REGISTRY.filter((definition) => definition.exposure === "server_only");
}

export function getRegistryDefinition(name: string): ComponentDefinition | undefined {
  return P0_CONTROLLED_REGISTRY.find((definition) => definition.name === name);
}

export type { ComponentDefinition } from "./descriptor";
