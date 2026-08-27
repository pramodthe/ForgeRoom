import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { describeArtifactStorageBoundary } from "./boundary";
import {
  ArtifactStorageKeyError,
  buildArtifactStorageKey,
  createLocalDirectoryArtifactStorage,
  hashArtifactContent,
  readArtifactContent,
  storeArtifactContent,
  toSafeArtifactFilename,
} from "./index";

describe("artifact storage adapter", () => {
  it("freezes local directory for development and demo persistent disk candidate", () => {
    expect(describeArtifactStorageBoundary()).toEqual({
      adapter: "local_directory",
      localDevelopment: "directory",
      demoDeployment: "local_directory_with_persistent_disk",
      ownerTask: "P0-310",
    });
  });

  it("stores and retrieves content under a workspace/channel scoped key", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "forgeroom-artifacts-"));
    try {
      const storage = createLocalDirectoryArtifactStorage({ rootDir });
      const content = Buffer.from("# probe\n", "utf8");
      const stored = await storeArtifactContent(storage, {
        workspaceId: "ws_1",
        channelId: "ch_1",
        revision: 1,
        content,
      });
      expect(stored.sha256).toBe(hashArtifactContent(content));
      expect(stored.storageKey).toBe(
        buildArtifactStorageKey({
          workspaceId: "ws_1",
          channelId: "ch_1",
          sha256: stored.sha256,
          revision: 1,
        }),
      );

      const roundTrip = await readArtifactContent(storage, {
        storageKey: stored.storageKey,
        workspaceId: "ws_1",
        channelId: "ch_1",
      });
      expect(roundTrip?.equals(content)).toBe(true);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("rejects storage keys that escape the workspace/channel namespace", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "forgeroom-artifacts-"));
    try {
      const storage = createLocalDirectoryArtifactStorage({ rootDir });
      await expect(
        storage.put({
          storageKey: "ws/ws_1/ch/other/sha/" + "a".repeat(64) + "/r1",
          content: Buffer.from("x"),
          workspaceId: "ws_1",
          channelId: "ch_1",
        }),
      ).rejects.toMatchObject({
        code: "storage_key_escape",
      });
      await expect(
        storage.put({
          storageKey: "../outside",
          content: Buffer.from("x"),
          workspaceId: "ws_1",
          channelId: "ch_1",
        }),
      ).rejects.toBeInstanceOf(ArtifactStorageKeyError);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("treats publishing identical content as idempotent", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "forgeroom-artifacts-"));
    try {
      const storage = createLocalDirectoryArtifactStorage({ rootDir });
      const content = Buffer.from("same bytes", "utf8");
      const first = await storeArtifactContent(storage, {
        workspaceId: "ws_1",
        channelId: "ch_1",
        revision: 2,
        content,
      });
      const second = await storeArtifactContent(storage, {
        workspaceId: "ws_1",
        channelId: "ch_1",
        revision: 2,
        content,
      });
      expect(second).toEqual(first);
      const objectPath = join(rootDir, first.storageKey);
      expect(await readFile(objectPath)).toEqual(content);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("retains published bytes across adapter re-open (persistence probe)", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "forgeroom-artifacts-"));
    const content = Buffer.from("forgeroom-p0-probe-sample.md", "utf8");
    const sha256 = hashArtifactContent(content);
    let storageKey = "";
    try {
      const writer = createLocalDirectoryArtifactStorage({ rootDir });
      const stored = await storeArtifactContent(writer, {
        workspaceId: "ws_1",
        channelId: "ch_1",
        revision: 1,
        content,
        sha256,
      });
      storageKey = stored.storageKey;
      await writeFile(join(rootDir, ".probe"), "retained", "utf8");

      const reader = createLocalDirectoryArtifactStorage({ rootDir });
      const loaded = await readArtifactContent(reader, {
        storageKey,
        workspaceId: "ws_1",
        channelId: "ch_1",
      });
      expect(loaded?.equals(content)).toBe(true);
      expect(await readFile(join(rootDir, ".probe"), "utf8")).toBe("retained");
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("sanitizes download filenames", () => {
    expect(toSafeArtifactFilename('report "final".md')).toBe("report _final_.md");
    expect(toSafeArtifactFilename("   ")).toBe("artifact");
  });
});
