import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { assertStorageKeyMatchesScope } from "./storage-key";
import {
  ArtifactStorageKeyError,
  type ArtifactStorageAdapter,
  type ArtifactStoragePutInput,
} from "./types";

function resolveObjectPath(rootDir: string, storageKey: string): string {
  if (storageKey.includes("..") || storageKey.startsWith("/") || storageKey.includes("\\")) {
    throw new ArtifactStorageKeyError("invalid_storage_key", "storage key contains forbidden path segments");
  }
  const root = resolve(rootDir);
  const full = resolve(root, storageKey);
  if (full !== root && !full.startsWith(`${root}${sep}`)) {
    throw new ArtifactStorageKeyError("storage_key_escape", "storage key resolves outside the storage root");
  }
  return full;
}

export type LocalDirectoryArtifactStorageOptions = {
  rootDir: string;
};

export function createLocalDirectoryArtifactStorage(
  options: LocalDirectoryArtifactStorageOptions,
): ArtifactStorageAdapter {
  const rootDir = resolve(options.rootDir);

  return {
    kind: "local_directory",

    async put(input: ArtifactStoragePutInput): Promise<void> {
      assertStorageKeyMatchesScope(input.storageKey, input.workspaceId, input.channelId);
      const objectPath = resolveObjectPath(rootDir, input.storageKey);
      await mkdir(dirname(objectPath), { recursive: true });
      await writeFile(objectPath, input.content, { flag: "wx" }).catch(async (error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") {
          throw error;
        }
        const existing = await readFile(objectPath);
        if (!existing.equals(input.content)) {
          throw new ArtifactStorageKeyError(
            "invalid_storage_key",
            "storage key already contains different content",
          );
        }
      });
    },

    async get(input) {
      assertStorageKeyMatchesScope(input.storageKey, input.workspaceId, input.channelId);
      const objectPath = resolveObjectPath(rootDir, input.storageKey);
      try {
        const content = await readFile(objectPath);
        return { content, byteSize: content.byteLength };
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === "ENOENT") {
          return null;
        }
        throw error;
      }
    },

    async exists(input) {
      assertStorageKeyMatchesScope(input.storageKey, input.workspaceId, input.channelId);
      const objectPath = resolveObjectPath(rootDir, input.storageKey);
      try {
        const info = await stat(objectPath);
        return info.isFile();
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === "ENOENT") {
          return false;
        }
        throw error;
      }
    },
  };
}

export function loadArtifactStorageFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ArtifactStorageAdapter {
  const configured = env.ARTIFACT_STORAGE_DIR?.trim();
  const rootDir =
    configured && configured.length > 0
      ? configured
      : resolve(process.cwd(), ".data", "artifacts");
  return createLocalDirectoryArtifactStorage({ rootDir });
}
