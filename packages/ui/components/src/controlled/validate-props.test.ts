import { describe, expect, it } from "vitest";
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
  });

  it("rejects tables that exceed the column limit", () => {
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
});
