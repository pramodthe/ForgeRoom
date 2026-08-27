import { describe, expect, it } from "vitest";
import {
  describeComposioBoundary,
  findForbiddenSurfaces,
  P0_COMPOSIO_DIRECT_TOOLS,
  P0_COMPOSIO_FORBIDDEN_SURFACES,
  P0_COMPOSIO_TOOLKIT,
} from "./index";

describe("Composio boundary", () => {
  it("does not imply ambient catalog access", () => {
    expect(describeComposioBoundary().catalogAccess).toBe("literal-allowlist-only");
    expect(describeComposioBoundary().session).toBe("direct-tools-hosted-mcp");
    expect(describeComposioBoundary().trueforgeConnector).toBe("composio_github");
    expect(describeComposioBoundary().ownerTask).toBe("P0-309");
    expect(describeComposioBoundary().toolPolicies).toBe("P0-303");
    expect(describeComposioBoundary().realRead).toBe("GITHUB_GET_AN_ISSUE");
    expect(describeComposioBoundary().deterministicWrite).toBe("GITHUB_ADD_LABELS_TO_AN_ISSUE");
    expect(describeComposioBoundary().connections).toBe("P0-304");
  });

  it("freezes two-to-four github direct tools and forbidden meta surfaces", () => {
    expect(P0_COMPOSIO_TOOLKIT).toBe("github");
    expect(P0_COMPOSIO_DIRECT_TOOLS.length).toBeGreaterThanOrEqual(2);
    expect(P0_COMPOSIO_DIRECT_TOOLS.length).toBeLessThanOrEqual(4);
    expect(findForbiddenSurfaces([...P0_COMPOSIO_DIRECT_TOOLS])).toEqual([]);
    expect(findForbiddenSurfaces([...P0_COMPOSIO_FORBIDDEN_SURFACES])).toEqual([
      ...P0_COMPOSIO_FORBIDDEN_SURFACES,
    ]);
  });
});
