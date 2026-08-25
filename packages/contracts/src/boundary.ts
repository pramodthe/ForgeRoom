import { z } from "zod";
import { opaqueIdSchema } from "./primitives";

export const packageBoundarySchema = z
  .object({
    release: z.literal("0.1"),
    agUiProfile: z.literal("unset-pending-P0-210"),
    copilotKit: z.literal("disabled"),
    openGeneratedUi: z.literal("disabled"),
    upstreamAgUiAdapters: z.literal("owned-by-P0-211"),
  })
  .strict();

export type PackageBoundary = z.infer<typeof packageBoundarySchema>;

export const PACKAGE_BOUNDARY: PackageBoundary = {
  release: "0.1",
  agUiProfile: "unset-pending-P0-210",
  copilotKit: "disabled",
  openGeneratedUi: "disabled",
  upstreamAgUiAdapters: "owned-by-P0-211",
};

export function parsePackageBoundary(input: unknown): PackageBoundary {
  return packageBoundarySchema.parse(input);
}

export const internalWorkerCommandNameSchema = z.enum([
  "claim_queue_item",
  "provision_or_rotate_session",
  "create_or_reconcile_turn",
  "ingest_trueforge_event",
  "validate_and_persist_agui_envelope",
  "offer_and_recheck_component_tool",
  "finalize_or_quarantine_ui_instance",
  "apply_scoped_ui_interaction",
  "claim_pause_group_resume",
  "publish_sandbox_artifact",
  "reconcile_deterministic_provider_update",
]);

export const apiMetaSchema = z
  .object({
    request_id: opaqueIdSchema,
  })
  .strict();
