import { describe, expect, it } from "vitest";
import { describeArtifactStorageBoundary } from "./index";

describe("artifact storage boundary", () => {
  it("freezes local directory for development and leaves demo durable adapter candidate", () => {
    expect(describeArtifactStorageBoundary()).toEqual({
      adapter: "local_directory",
      localDevelopment: "directory",
      demoDeployment: "candidate-pending-live-probe",
      ownerTask: "P0-000",
    });
  });
});
