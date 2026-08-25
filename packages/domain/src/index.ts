import { PACKAGE_BOUNDARY, type PackageBoundary } from "@forgeroom/contracts";

export type { PackageBoundary };

export const DOMAIN_RELEASE = PACKAGE_BOUNDARY.release;

/** Product schemas for channels, coworkers, runs and records are owned by P0-102. */
export function assertFoundationBoundary(): PackageBoundary {
  return PACKAGE_BOUNDARY;
}
