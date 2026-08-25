import { describe, expect, it } from "vitest";
import { APP_NAME } from "./app-name";

describe("web shell", () => {
  it("uses the product name without loading generated UI", () => {
    expect(APP_NAME).toBe("ForgeRoom");
  });
});
