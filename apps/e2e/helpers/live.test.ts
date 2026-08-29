import { describe, expect, it } from "vitest";
import { hasProviderCredentials, missingProviderCredentials, PROVIDER_ENV_KEYS } from "./live";

describe("provider credential helpers", () => {
  it("lists missing keys without reading values", () => {
    const missing = missingProviderCredentials();
    for (const key of missing) {
      expect(PROVIDER_ENV_KEYS).toContain(key);
    }
    expect(hasProviderCredentials()).toBe(missing.length === 0);
  });
});
