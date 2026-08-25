import { describe, expect, it } from "vitest";
import { describeComposioBoundary } from "./index";

describe("Composio boundary", () => {
  it("does not imply ambient catalog access", () => {
    expect(describeComposioBoundary().catalogAccess).toBe("literal-allowlist-only");
  });
});
