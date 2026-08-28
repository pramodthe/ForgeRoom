import type { InternalWorkerCommand } from "@forgeroom/contracts";
import {
  applyScopedUiInteractionWorker,
  finalizeOrQuarantineUiInstance,
  loadComponentOfferContext,
  type createSql,
} from "@forgeroom/db";
import {
  executeApplyScopedUiInteractionCommand,
  executeFinalizeOrQuarantineUiInstanceCommand,
  executeOfferAndRecheckComponentToolCommand,
  type ApplyScopedUiInteractionCommand,
  type ComponentOfferContext,
  type ComponentToolBridgeAdapters,
  type FinalizeUiInstanceCommand,
  type OfferAndRecheckComponentToolCommand,
} from "@forgeroom/orchestration/component-tool-bridge";

type SqlClient = ReturnType<typeof createSql>;

function mapOfferContext(
  result: Awaited<ReturnType<typeof loadComponentOfferContext>>,
): { ok: true; context: ComponentOfferContext } | { ok: false; code: string; message: string } {
  if (!result.ok) {
    return { ok: false, code: result.code, message: result.message };
  }
  return {
    ok: true,
    context: {
      sessionId: result.value.sessionId,
      generationId: result.value.generationId,
      generation: result.value.generation,
      offeredComponentToolNames: result.value.offeredComponentToolNames,
      stableName: result.value.stableName,
      descriptorHash: result.value.descriptorHash,
      exposure: result.value.exposure,
      hasActiveGrant: result.value.hasActiveGrant,
    },
  };
}

export function createWorkerComponentToolBridgeAdapters(
  sql: SqlClient,
): ComponentToolBridgeAdapters {
  return {
    async loadOfferContext(command: OfferAndRecheckComponentToolCommand) {
      const loaded = await loadComponentOfferContext(sql, {
        channelId: command.payload.channel_id,
        coworkerId: command.payload.coworker_id,
        expectedSessionGeneration: command.payload.expected_session_generation,
        componentVersionId: command.payload.component_version_id,
        expectedDescriptorHash: command.payload.expected_descriptor_hash,
        expectedGrantScopeHash: command.payload.expected_grant_scope_hash,
        runStepId: command.payload.run_step_id,
        agentTurnId: command.payload.agent_turn_id,
      });
      return mapOfferContext(loaded);
    },
    async finalizeUiInstance(command: FinalizeUiInstanceCommand) {
      const result = await finalizeOrQuarantineUiInstance(sql, {
        uiInstanceId: command.payload.ui_instance_id,
        expectedStatus: command.payload.expected_status,
        expectedRenderRevision: command.payload.expected_render_revision,
        nextRenderRevision: command.payload.next_render_revision,
        renderManifestHash: command.payload.render_manifest_hash,
        outcome: command.payload.outcome,
      });
      if (!result.ok) {
        return { ok: false as const, code: result.code, message: result.message };
      }
      return {
        ok: true as const,
        uiInstanceId: result.value.uiInstanceId,
        renderRevision: result.value.renderRevision,
        status: result.value.status,
      };
    },
    async applyScopedInteraction(command: ApplyScopedUiInteractionCommand) {
      const result = await applyScopedUiInteractionWorker(sql, {
        interactionId: command.payload.interaction_id,
        uiInstanceId: command.payload.ui_instance_id,
        expectedInteractionState: command.payload.expected_interaction_state,
        expectedRenderRevision: command.payload.expected_render_revision,
        expectedStateRevision: command.payload.expected_state_revision,
        actionGrantId: command.payload.action_grant_id,
        expectedActionGrantUseCount: command.payload.expected_action_grant_use_count,
        redactedInputHash: command.payload.redacted_input_hash,
      });
      if (!result.ok) {
        return { ok: false as const, code: result.code, message: result.message };
      }
      return {
        ok: true as const,
        interactionId: result.value.interactionId,
        enqueuedContinuation: result.value.enqueuedContinuation,
        queueItemId: result.value.queueItemId,
      };
    },
  };
}

export async function executeOfferAndRecheckComponentTool(
  sql: SqlClient,
  command: OfferAndRecheckComponentToolCommand,
) {
  return executeOfferAndRecheckComponentToolCommand(
    createWorkerComponentToolBridgeAdapters(sql),
    command,
  );
}

export async function executeFinalizeOrQuarantineUiInstance(
  sql: SqlClient,
  command: FinalizeUiInstanceCommand,
) {
  return executeFinalizeOrQuarantineUiInstanceCommand(
    createWorkerComponentToolBridgeAdapters(sql),
    command,
  );
}

export async function executeApplyScopedUiInteraction(
  sql: SqlClient,
  command: ApplyScopedUiInteractionCommand,
) {
  return executeApplyScopedUiInteractionCommand(
    createWorkerComponentToolBridgeAdapters(sql),
    command,
  );
}

export type ComponentToolWorkerCommand =
  OfferAndRecheckComponentToolCommand | FinalizeUiInstanceCommand | ApplyScopedUiInteractionCommand;

export function isComponentToolWorkerCommand(
  command: InternalWorkerCommand,
): command is ComponentToolWorkerCommand {
  return (
    command.name === "offer_and_recheck_component_tool" ||
    command.name === "finalize_or_quarantine_ui_instance" ||
    command.name === "apply_scoped_ui_interaction"
  );
}
