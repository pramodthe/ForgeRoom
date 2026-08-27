export type ArtifactStorageBoundary = {
  adapter: "local_directory";
  localDevelopment: "directory";
  demoDeployment: "local_directory_with_persistent_disk";
  ownerTask: "P0-310";
};

export function describeArtifactStorageBoundary(): ArtifactStorageBoundary {
  return {
    adapter: "local_directory",
    localDevelopment: "directory",
    demoDeployment: "local_directory_with_persistent_disk",
    ownerTask: "P0-310",
  };
}
