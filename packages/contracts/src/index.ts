import { z } from "zod";

/** Protocol-neutral package profile. Exact `@ag-ui/*` adapters are owned by P0-210/P0-211. */
export const packageBoundarySchema = z.object({
  release: z.literal("0.1"),
  agUiProfile: z.literal("unset-pending-P0-210"),
  copilotKit: z.literal("disabled"),
  openGeneratedUi: z.literal("disabled"),
});

export type PackageBoundary = z.infer<typeof packageBoundarySchema>;

export const PACKAGE_BOUNDARY: PackageBoundary = {
  release: "0.1",
  agUiProfile: "unset-pending-P0-210",
  copilotKit: "disabled",
  openGeneratedUi: "disabled",
};

export function parsePackageBoundary(input: unknown): PackageBoundary {
  return packageBoundarySchema.parse(input);
}
