import { describe, expect, it } from "vitest";
import { describeTrueForgeBoundary } from "./index";

describe("TrueForge boundary", () => {
  it("reserves the harness without loading an SDK", () => {
    expect(describeTrueForgeBoundary()).toEqual({
      harness: "trueforge",
      sdk: "pending-P0-201",
      nativeSubagents: "disabled",
    });
  });
});
