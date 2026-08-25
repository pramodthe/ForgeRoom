import { describe, expect, it } from "vitest";
import { describeControlledUiBoundary } from "./index";

describe("controlled component boundary", () => {
  it("keeps the open generated UI rail disabled", () => {
    expect(describeControlledUiBoundary()).toEqual({
      rail: "registered_react",
      openGeneratedUi: "disabled",
    });
  });
});
