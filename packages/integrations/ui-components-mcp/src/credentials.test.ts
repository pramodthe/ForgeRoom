import { describe, expect, it } from "vitest";
import { isUiComponentsMcpConnectorName } from "./constants";
import { deriveUiComponentsMcpSecret } from "./credentials";

describe("deriveUiComponentsMcpSecret", () => {
  it("derives a stable per-generation secret", () => {
    const first = deriveUiComponentsMcpSecret("master-secret", "gen_1");
    const second = deriveUiComponentsMcpSecret("master-secret", "gen_1");
    const otherGeneration = deriveUiComponentsMcpSecret("master-secret", "gen_2");

    expect(first).toBe(second);
    expect(first).not.toBe(otherGeneration);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("isUiComponentsMcpConnectorName", () => {
  it("matches only legacy and per-generation ui component connectors", () => {
    expect(isUiComponentsMcpConnectorName("ui_components_v1")).toBe(true);
    expect(isUiComponentsMcpConnectorName("ui_components_v1__gen_1")).toBe(true);
    expect(isUiComponentsMcpConnectorName("ui_components_v10")).toBe(false);
    expect(isUiComponentsMcpConnectorName("composio_github")).toBe(false);
  });
});
