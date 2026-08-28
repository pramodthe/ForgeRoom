import { describe, expect, it } from "vitest";
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
