import { describe, expect, it } from "vitest";
import { assertFoundationBoundary, DOMAIN_RELEASE } from "./index";

describe("domain boundary", () => {
  it("reuses the shared 0.1 contract profile", () => {
    expect(DOMAIN_RELEASE).toBe("0.1");
    expect(assertFoundationBoundary().agUiProfile).toBe("unset-pending-P0-210");
  });
});
