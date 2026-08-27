import { ArtifactStorageKeyError } from "./types";
import { sha256Hex } from "./hash";

const STORAGE_KEY_PATTERN =
  /^ws\/[^/]+\/ch\/[^/]+\/sha\/[0-9a-f]{64}\/r[1-9][0-9]*$/i;

export function buildArtifactStorageKey(input: {
  workspaceId: string;
  channelId: string;
  sha256: string;
  revision: number;
}): string {
  if (!Number.isInteger(input.revision) || input.revision < 1) {
    throw new ArtifactStorageKeyError("invalid_storage_key", "revision must be a positive integer");
  }
  const hex = sha256Hex(input.sha256);
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new ArtifactStorageKeyError("invalid_storage_key", "sha256 must be a 64-character hex digest");
  }
  return `ws/${input.workspaceId}/ch/${input.channelId}/sha/${hex.toLowerCase()}/r${input.revision}`;
}

export function assertStorageKeyMatchesScope(
  storageKey: string,
  workspaceId: string,
  channelId: string,
): void {
  if (!STORAGE_KEY_PATTERN.test(storageKey) || storageKey.includes("..")) {
    throw new ArtifactStorageKeyError("invalid_storage_key", "storage key format is invalid");
  }
  const expectedPrefix = `ws/${workspaceId}/ch/${channelId}/`;
  if (!storageKey.startsWith(expectedPrefix)) {
    throw new ArtifactStorageKeyError(
      "storage_key_escape",
      "storage key must remain inside the workspace/channel namespace",
    );
  }
}
