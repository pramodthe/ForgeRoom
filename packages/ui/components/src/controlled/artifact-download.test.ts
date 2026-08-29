import { describe, expect, it } from "vitest";
import { safeArtifactDownloadPath } from "./artifact-download";

describe("safeArtifactDownloadPath", () => {
  it("builds an authenticated download path for safe artifact ids", () => {
    expect(safeArtifactDownloadPath("art_1")).toBe("/api/artifacts/art_1/download");
  });

  it("rejects arbitrary URLs and path traversal", () => {
    expect(safeArtifactDownloadPath("https://evil.test/a")).toBeUndefined();
    expect(safeArtifactDownloadPath("javascript:alert(1)")).toBeUndefined();
    expect(safeArtifactDownloadPath("../art_1")).toBeUndefined();
    expect(safeArtifactDownloadPath("art/1")).toBeUndefined();
  });

  it("rejects non-string values", () => {
    expect(safeArtifactDownloadPath(null)).toBeUndefined();
    expect(safeArtifactDownloadPath(42)).toBeUndefined();
  });
});
