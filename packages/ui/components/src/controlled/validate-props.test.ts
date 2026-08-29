import { describe, expect, it } from "vitest";
import {
  MAX_CHART_SERIES,
  MAX_FORM_FIELDS,
  MAX_FORM_OPTIONS,
  MAX_STRING_LENGTH,
  MAX_TABLE_COLUMNS,
} from "./limits";
import { validateControlledProps } from "./validate-props";

describe("validateControlledProps", () => {
  it("rejects malformed column entries", () => {
    const result = validateControlledProps("DataTable", {
      caption: "Records",
      empty_text: "None",
      columns: [null],
    });
    expect(result.ok).toBe(false);
  });

  it("accepts valid DataTable props", () => {
    const result = validateControlledProps("DataTable", {
      caption: "Records",
      empty_text: "None",
      columns: [{ key: "id", label: "ID" }],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects unknown props when additionalProperties is false", () => {
    const result = validateControlledProps("DataTable", {
      caption: "Records",
      empty_text: "None",
      columns: [],
      __dangerous: true,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects prototype pollution keys", () => {
    const result = validateControlledProps("DataTable", {
      caption: "Records",
      empty_text: "None",
      columns: [],
      constructor: { polluted: true },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects unknown component names", () => {
    const result = validateControlledProps("ApprovalCard", {
      caption: "nope",
      empty_text: "nope",
      columns: [],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/unknown/i);
    }
  });

  it("rejects tables that exceed the schema column maxItems", () => {
    const result = validateControlledProps("DataTable", {
      caption: "Records",
      empty_text: "None",
      columns: Array.from({ length: 26 }, (_, index) => ({
        key: `col_${index}`,
        label: `Column ${index}`,
      })),
    });
    expect(result.ok).toBe(false);
  });

  it("accepts schema-valid column counts above the presentation column clamp", () => {
    // Schema maxItems is 25; presentation clamp is MAX_TABLE_COLUMNS (12).
    expect(MAX_TABLE_COLUMNS).toBeLessThan(25);
    const result = validateControlledProps("DataTable", {
      caption: "Records",
      empty_text: "None",
      columns: Array.from({ length: MAX_TABLE_COLUMNS + 1 }, (_, index) => ({
        key: `col_${index}`,
        label: `Column ${index}`,
      })),
    });
    expect(result.ok).toBe(true);
  });

  it("accepts text props containing angle brackets without treating them as HTML", () => {
    const result = validateControlledProps("DataTable", {
      caption: "<script>alert(1)</script>",
      empty_text: "None",
      columns: [{ key: "id", label: "ID" }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.caption).toBe("<script>alert(1)</script>");
    }
  });

  it("rejects string props longer than MAX_STRING_LENGTH", () => {
    const result = validateControlledProps("DataTable", {
      caption: "x".repeat(MAX_STRING_LENGTH + 1),
      empty_text: "None",
      columns: [{ key: "id", label: "ID" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/max length/);
    }
  });

  it("accepts minimal valid BarOrLineChart props", () => {
    const result = validateControlledProps("BarOrLineChart", {
      title: "Issues",
      chart_type: "bar",
      x_axis_label: "Day",
      y_axis_label: "Count",
      series: [{ key: "open", label: "Open" }],
      accessible_table_caption: "Open issues by day",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects charts that exceed the series maxItems", () => {
    const result = validateControlledProps("BarOrLineChart", {
      title: "Issues",
      chart_type: "line",
      x_axis_label: "Day",
      y_axis_label: "Count",
      series: Array.from({ length: MAX_CHART_SERIES + 1 }, (_, index) => ({
        key: `s${index}`,
        label: `Series ${index}`,
      })),
      accessible_table_caption: "Too many series",
    });
    expect(result.ok).toBe(false);
  });

  it("accepts minimal valid TaskCard props", () => {
    const result = validateControlledProps("TaskCard", {
      heading: "Task",
      show_description: true,
      show_assignee: true,
      show_due_date: false,
      show_history: true,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects TaskCard missing a required boolean", () => {
    const result = validateControlledProps("TaskCard", {
      heading: "Task",
      show_description: true,
      show_assignee: true,
      show_due_date: false,
    });
    expect(result.ok).toBe(false);
  });

  it("accepts minimal valid ArtifactCard props", () => {
    const result = validateControlledProps("ArtifactCard", {
      heading: "Artifact",
      show_preview: true,
      show_source: true,
      download_label: "Download",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts minimal valid ChoiceForm props", () => {
    const result = validateControlledProps("ChoiceForm", {
      title: "Pick one",
      submit_label: "Submit",
      cancel_label: "Cancel",
      fields: [
        {
          id: "choice",
          label: "Choice",
          kind: "single_select",
          required: true,
          options: [{ id: "a", label: "A" }],
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects ChoiceForm fields that exceed schema maxItems", () => {
    const result = validateControlledProps("ChoiceForm", {
      title: "Pick one",
      submit_label: "Submit",
      cancel_label: "Cancel",
      fields: Array.from({ length: MAX_FORM_FIELDS + 1 }, (_, index) => ({
        id: `f${index}`,
        label: `Field ${index}`,
        kind: "text",
        required: false,
      })),
    });
    expect(result.ok).toBe(false);
  });

  it("rejects ChoiceForm options that exceed maxItems", () => {
    const result = validateControlledProps("ChoiceForm", {
      title: "Pick one",
      submit_label: "Submit",
      cancel_label: "Cancel",
      fields: [
        {
          id: "choice",
          label: "Choice",
          kind: "single_select",
          required: true,
          options: Array.from({ length: MAX_FORM_OPTIONS + 1 }, (_, index) => ({
            id: `o${index}`,
            label: `Option ${index}`,
          })),
        },
      ],
    });
    expect(result.ok).toBe(false);
  });
});
