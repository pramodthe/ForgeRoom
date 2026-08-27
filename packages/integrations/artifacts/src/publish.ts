import { buildArtifactStorageKey } from "./storage-key";
import { hashArtifactContent } from "./hash";
import type { ArtifactStorageAdapter } from "./types";

export type StoredArtifactContent = {
  storageKey: string;
  sha256: string;
  byteSize: number;
};

export async function storeArtifactContent(
  storage: ArtifactStorageAdapter,
  input: {
    workspaceId: string;
    channelId: string;
    revision: number;
    content: Buffer;
    sha256?: string;
  },
): Promise<StoredArtifactContent> {
  const sha256 = input.sha256 ?? hashArtifactContent(input.content);
  const storageKey = buildArtifactStorageKey({
    workspaceId: input.workspaceId,
    channelId: input.channelId,
    sha256,
    revision: input.revision,
  });
  await storage.put({
    storageKey,
    content: input.content,
    workspaceId: input.workspaceId,
    channelId: input.channelId,
  });
  return {
    storageKey,
    sha256,
    byteSize: input.content.byteLength,
  };
}

export async function readArtifactContent(
  storage: ArtifactStorageAdapter,
  input: {
    storageKey: string;
    workspaceId: string;
    channelId: string;
  },
): Promise<Buffer | null> {
  const loaded = await storage.get(input);
  return loaded?.content ?? null;
}
