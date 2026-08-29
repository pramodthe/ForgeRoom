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
});
