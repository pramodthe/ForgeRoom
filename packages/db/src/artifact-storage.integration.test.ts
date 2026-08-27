import { describe, expect, it } from "vitest";
import {
  findArtifactByContentRevision,
  publishArtifactRecord,
  type PublishArtifactRecordInput,
} from "./artifact-storage";
import { HASH, NOW, seedRuntime, withMigratedDatabase } from "./test-harness";

function baseInput(overrides?: Partial<PublishArtifactRecordInput>): PublishArtifactRecordInput {
  return {
    id: "artifact_1",
    workspaceId: "ws_1",
    channelId: "ch_1",
    runId: "run_1",
    runStepId: "step_1",
    creatorAgentId: "cw_1",
    kind: "file",
    name: "probe.md",
    mimeType: "text/markdown",
    storageKey: `ws/ws_1/ch/ch_1/sha/${"fe".repeat(32)}/r1`,
    byteSize: 12,
    sha256: HASH,
    revision: 1,
    metadataJson: { source: "test" },
    createdAt: NOW,
    ...overrides,
  };
}

describe("artifact storage records", () => {
  it("persists metadata with hash, mime, size, creator, run/step and revision", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const result = await publishArtifactRecord(sql, baseInput());
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      expect(result.created).toBe(true);
      expect(result.artifact).toMatchObject({
        id: "artifact_1",
        workspaceId: "ws_1",
        channelId: "ch_1",
        runId: "run_1",
        runStepId: "step_1",
        creatorAgentId: "cw_1",
        kind: "file",
        mimeType: "text/markdown",
        byteSize: 12,
        sha256: HASH,
        revision: 1,
      });
    });
  });

  it("returns the existing row when identical content revision is published again", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const first = await publishArtifactRecord(sql, baseInput());
      const second = await publishArtifactRecord(
        sql,
        baseInput({ id: "artifact_duplicate", name: "ignored-on-idempotent-replay" }),
      );
      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (!first.ok || !second.ok) {
        return;
      }
      expect(second.created).toBe(false);
      expect(second.artifact.id).toBe(first.artifact.id);
      const loaded = await findArtifactByContentRevision(sql, HASH, 1);
      expect(loaded?.id).toBe("artifact_1");
    });
  });
});
