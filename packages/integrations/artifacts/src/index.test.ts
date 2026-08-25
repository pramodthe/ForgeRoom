import { describe, expect, it } from "vitest";
import { describeArtifactStorageBoundary } from "./index";

describe("artifact storage boundary", () => {
  it("waits for P0-000 to select the durable adapter", () => {
    expect(describeArtifactStorageBoundary().adapter).toBe("pending-P0-000");
  });
});
