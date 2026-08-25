import { describe, expect, it } from "vitest";
import { isForbiddenP0101Dependency } from "./index";

describe("isForbiddenP0101Dependency", () => {
  it("blocks AG-UI and CopilotKit packages", () => {
    expect(isForbiddenP0101Dependency("@ag-ui/core")).toBe(true);
    expect(isForbiddenP0101Dependency("@copilotkit/runtime")).toBe(true);
    expect(isForbiddenP0101Dependency("zod")).toBe(false);
  });
});
