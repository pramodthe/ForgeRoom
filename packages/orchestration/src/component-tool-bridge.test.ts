import { describe, expect, it } from "vitest";
import { recheckComponentToolCall } from "./capability-intersection";
import {
  executeFinalizeOrQuarantineUiInstanceCommand,
  executeOfferAndRecheckComponentToolCommand,
  type ComponentToolBridgeAdapters,
} from "./component-tool-bridge";

const HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("component tool bridge", () => {
  const adapters: ComponentToolBridgeAdapters = {
    async loadOfferContext(command) {
      if (command.payload.component_version_id !== "compv_1") {
        return { ok: false, code: "not_found", message: "Component version not found." };
      }
      return {
        ok: true,
        context: {
          sessionId: "cas_1",
          generationId: "gen_1",
          generation: command.payload.expected_session_generation,
          offeredComponentToolNames: ["ui.dataTable"],
          stableName: "DataTable",
          descriptorHash: command.payload.expected_descriptor_hash,
          exposure: "agent_tool",
          hasActiveGrant: true,
        },
      };
    },
    async finalizeUiInstance(command) {
      return {
        ok: true,
        uiInstanceId: command.payload.ui_instance_id,
        renderRevision: command.payload.next_render_revision,
        status: command.payload.outcome === "ready" ? "ready" : "failed",
      };
    },
    async applyScopedInteraction() {
      return {
        ok: true,
        interactionId: "interaction_1",
        enqueuedContinuation: false,
        queueItemId: null,
      };
    },
  };

  it("rechecks an offered granted component tool", async () => {
    const result = await executeOfferAndRecheckComponentToolCommand(adapters, {
      schemaVersion: 1,
      command_id: "cmd_1",
      name: "offer_and_recheck_component_tool",
      payload: {
        channel_id: "ch_1",
        coworker_id: "cw_1",
        run_step_id: "step_1",
        agent_turn_id: "turn_1",
        expected_session_generation: 1,
        component_version_id: "compv_1",
        expected_descriptor_hash: HASH,
        expected_grant_scope_hash: HASH,
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.toolName).toBe("ui.dataTable");
    }
  });

  it("fails closed when the tool was not offered in the current revision", async () => {
    const staleAdapters: ComponentToolBridgeAdapters = {
      ...adapters,
      async loadOfferContext(command) {
        const base = await adapters.loadOfferContext(command);
        if (!base.ok) {
          return base;
        }
        return { ok: true, context: { ...base.context, offeredComponentToolNames: [] } };
      },
    };
    const result = await executeOfferAndRecheckComponentToolCommand(staleAdapters, {
      schemaVersion: 1,
      command_id: "cmd_2",
      name: "offer_and_recheck_component_tool",
      payload: {
        channel_id: "ch_1",
        coworker_id: "cw_1",
        run_step_id: "step_1",
        agent_turn_id: "turn_1",
        expected_session_generation: 1,
        component_version_id: "compv_1",
        expected_descriptor_hash: HASH,
        expected_grant_scope_hash: HASH,
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("not_offered");
    }
  });

  it("uses the same recheck helper as session rotation", () => {
    const recheck = recheckComponentToolCall({
      candidate: {
        stableName: "DataTable",
        toolName: "ui.dataTable",
        published: true,
        activeGrant: false,
        exposure: "agent_tool",
        actualDescriptorHash: HASH,
      },
      offeredInCurrentRevision: true,
    });
    expect(recheck.ok).toBe(false);
  });

  it("finalizes a building instance to ready", async () => {
    const result = await executeFinalizeOrQuarantineUiInstanceCommand(adapters, {
      schemaVersion: 1,
      command_id: "cmd_3",
      name: "finalize_or_quarantine_ui_instance",
      payload: {
        ui_instance_id: "ui_1",
        expected_status: "building",
        expected_render_revision: null,
        next_render_revision: 1,
        render_manifest_hash: HASH,
        outcome: "ready",
      },
    });
    expect(result).toMatchObject({
      ok: true,
      uiInstanceId: "ui_1",
      renderRevision: 1,
      status: "ready",
      outcome: "ready",
    });
  });
});
