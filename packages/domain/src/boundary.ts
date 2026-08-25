import { PACKAGE_BOUNDARY, type PackageBoundary } from "@forgeroom/contracts";

export type { PackageBoundary };

export const DOMAIN_RELEASE = PACKAGE_BOUNDARY.release;

export function assertFoundationBoundary(): PackageBoundary {
  return PACKAGE_BOUNDARY;
}
