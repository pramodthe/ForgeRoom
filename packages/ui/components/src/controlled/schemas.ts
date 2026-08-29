import { P0_AGENT_TOOL_COMPONENT_NAMES } from "../index";
import { MAX_CHART_SERIES, MAX_FORM_FIELDS, MAX_FORM_OPTIONS } from "./limits";

type P0AgentToolComponentName = (typeof P0_AGENT_TOOL_COMPONENT_NAMES)[number];

/** Browser-safe parameter schemas mirrored from the governed registry (P0-314). */
export const PARAMETER_SCHEMAS: Record<
  P0AgentToolComponentName,
  {
    type: "object";
    additionalProperties: boolean;
    properties: Record<string, unknown>;
    required: string[];
  }
> = {
  DataTable: {
    type: "object",
    additionalProperties: false,
    properties: {
      caption: { type: "string" },
      description: { type: ["string", "null"] },
      empty_text: { type: "string" },
      columns: {
        type: "array",
        maxItems: 25,
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
  BarOrLineChart: {
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
        maxItems: MAX_CHART_SERIES,
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
  TaskCard: {
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
  ArtifactCard: {
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
  ChoiceForm: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string" },
      description: { type: ["string", "null"] },
      submit_label: { type: "string" },
      cancel_label: { type: "string" },
      fields: {
        type: "array",
        maxItems: MAX_FORM_FIELDS,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            description: { type: ["string", "null"] },
            kind: { type: "string" },
            required: { type: "boolean" },
            options: {
              type: "array",
              maxItems: MAX_FORM_OPTIONS,
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
};
