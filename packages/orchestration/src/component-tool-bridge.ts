import type { InternalWorkerCommand } from "@forgeroom/contracts";
import {
  recheckComponentToolCall,
  type ControlledComponentCandidate,
} from "./capability-intersection";

export type OfferAndRecheckComponentToolCommand = Extract<
  InternalWorkerCommand,
  { name: "offer_and_recheck_component_tool" }
>;

export type FinalizeUiInstanceCommand = Extract<
  InternalWorkerCommand,
  { name: "finalize_or_quarantine_ui_instance" }
>;

export type ApplyScopedUiInteractionCommand = Extract<
  InternalWorkerCommand,
  { name: "apply_scoped_ui_interaction" }
>;

export type ComponentOfferContext = {
  sessionId: string;
  generationId: string;
  generation: number;
  offeredComponentToolNames: string[];
  stableName: string;
  descriptorHash: string;
  exposure: "agent_tool" | "server_only";
  hasActiveGrant: boolean;
};

export type ComponentToolBridgeAdapters = {
  loadOfferContext: (
    command: OfferAndRecheckComponentToolCommand,
  ) => Promise<
    { ok: true; context: ComponentOfferContext } | { ok: false; code: string; message: string }
  >;
  finalizeUiInstance: (
    command: FinalizeUiInstanceCommand,
  ) => Promise<
    | { ok: true; uiInstanceId: string; renderRevision: number; status: string }
    | { ok: false; code: string; message: string }
  >;
  applyScopedInteraction: (command: ApplyScopedUiInteractionCommand) => Promise<
    | {
        ok: true;
        interactionId: string;
        enqueuedContinuation: boolean;
        queueItemId: string | null;
      }
    | { ok: false; code: string; message: string }
  >;
};

export type OfferAndRecheckResult =
  | {
      ok: true;
      sessionId: string;
      generationId: string;
      stableName: string;
      toolName: string;
      descriptorHash: string;
    }
  | {
      ok: false;
      kind:
        | "not_found"
        | "stale_generation"
        | "descriptor_mismatch"
        | "grant_scope_mismatch"
        | "stale_or_ungranted"
        | "not_offered"
        | "server_only";
      message: string;
    };

export type FinalizeUiInstanceResult =
  | {
      ok: true;
      uiInstanceId: string;
      renderRevision: number;
      status: string;
      outcome: "ready" | "quarantined";
    }
  | {
      ok: false;
      kind:
        "not_found" | "status_mismatch" | "revision_mismatch" | "conflict" | "validation_failed";
      message: string;
    };

export type ApplyScopedUiInteractionResult =
  | {
      ok: true;
      interactionId: string;
      enqueuedContinuation: boolean;
      queueItemId: string | null;
    }
  | {
      ok: false;
      kind: "not_found" | "interaction_state_mismatch" | "input_hash_mismatch" | "scope_mismatch";
      message: string;
    };

function componentToolName(stableName: string): string {
  if (stableName.length === 0) {
    return "ui.";
  }
  return `ui.${stableName.charAt(0).toLowerCase()}${stableName.slice(1)}`;
}

export async function executeOfferAndRecheckComponentToolCommand(
  adapters: ComponentToolBridgeAdapters,
  command: OfferAndRecheckComponentToolCommand,
): Promise<OfferAndRecheckResult> {
  const loaded = await adapters.loadOfferContext(command);
  if (!loaded.ok) {
    const kind =
      loaded.code === "stale_generation"
        ? "stale_generation"
        : loaded.code === "descriptor_mismatch"
          ? "descriptor_mismatch"
          : loaded.code === "grant_scope_mismatch"
            ? "grant_scope_mismatch"
            : "not_found";
    return {
      ok: false,
      kind,
      message: loaded.message,
    };
  }
  const context = loaded.context;
  if (context.exposure === "server_only") {
    return {
      ok: false,
      kind: "server_only",
      message: "Server-only components cannot be offered as agent tools.",
    };
  }

  const toolName = componentToolName(context.stableName);
  const offeredInCurrentRevision = context.offeredComponentToolNames.includes(toolName);
  const candidate: ControlledComponentCandidate = {
    stableName: context.stableName,
    toolName,
    published: true,
    activeGrant: context.hasActiveGrant,
    exposure: context.exposure,
    expectedDescriptorHash: command.payload.expected_descriptor_hash,
    actualDescriptorHash: context.descriptorHash,
  };
  const recheck = recheckComponentToolCall({ candidate, offeredInCurrentRevision });
  if (!recheck.ok) {
    return {
      ok: false,
      kind: recheck.reason,
      message:
        recheck.reason === "not_offered"
          ? "Component tool was not offered in the current session revision."
          : "Component tool grant or descriptor is stale.",
    };
  }

  return {
    ok: true,
    sessionId: context.sessionId,
    generationId: context.generationId,
    stableName: context.stableName,
    toolName,
    descriptorHash: context.descriptorHash,
  };
}

export async function executeFinalizeOrQuarantineUiInstanceCommand(
  adapters: ComponentToolBridgeAdapters,
  command: FinalizeUiInstanceCommand,
): Promise<FinalizeUiInstanceResult> {
  const result = await adapters.finalizeUiInstance(command);
  if (!result.ok) {
    return {
      ok: false,
      kind:
        result.code === "not_found"
          ? "not_found"
          : result.code === "status_mismatch"
            ? "status_mismatch"
            : result.code === "revision_mismatch"
              ? "revision_mismatch"
              : result.code === "conflict"
                ? "conflict"
                : "validation_failed",
      message: result.message,
    };
  }
  return {
    ok: true,
    uiInstanceId: result.uiInstanceId,
    renderRevision: result.renderRevision,
    status: result.status,
    outcome: command.payload.outcome,
  };
}

export async function executeApplyScopedUiInteractionCommand(
  adapters: ComponentToolBridgeAdapters,
  command: ApplyScopedUiInteractionCommand,
): Promise<ApplyScopedUiInteractionResult> {
  const result = await adapters.applyScopedInteraction(command);
  if (!result.ok) {
    return {
      ok: false,
      kind: result.code as ApplyScopedUiInteractionResult extends { ok: false; kind: infer K }
        ? K
        : never,
      message: result.message,
    };
  }
  return {
    ok: true,
    interactionId: result.interactionId,
    enqueuedContinuation: result.enqueuedContinuation,
    queueItemId: result.queueItemId,
  };
}
