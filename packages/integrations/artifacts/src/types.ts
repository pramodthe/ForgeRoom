export type ArtifactKind = "file" | "preview";

export type ArtifactStoragePutInput = {
  storageKey: string;
  content: Buffer;
  workspaceId: string;
  channelId: string;
};

export type ArtifactStorageGetResult = {
  content: Buffer;
  byteSize: number;
};

export type ArtifactStorageAdapter = {
  readonly kind: "local_directory";
  put(input: ArtifactStoragePutInput): Promise<void>;
  get(input: {
    storageKey: string;
    workspaceId: string;
    channelId: string;
  }): Promise<ArtifactStorageGetResult | null>;
  exists(input: {
    storageKey: string;
    workspaceId: string;
    channelId: string;
  }): Promise<boolean>;
  delete?(input: {
    storageKey: string;
    workspaceId: string;
    channelId: string;
  }): Promise<void>;
};

export type PublishArtifactContentInput = {
  workspaceId: string;
  channelId: string;
  sha256: string;
  revision: number;
  content: Buffer;
};

export class ArtifactStorageKeyError extends Error {
  readonly code: "invalid_storage_key" | "storage_key_escape";

  constructor(code: ArtifactStorageKeyError["code"], message: string) {
    super(message);
    this.name = "ArtifactStorageKeyError";
    this.code = code;
  }
}
