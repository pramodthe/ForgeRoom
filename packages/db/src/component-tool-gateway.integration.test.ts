import { describe, expect, it } from "vitest";
import { buildGrantScopePreimage, hashGrantScope } from "@forgeroom/domain";
import {
  brokerComponentToolMcpCall,
  finalizeOrQuarantineUiInstance,
  loadComponentOfferContext,
} from "./component-tool-gateway";
import { HASH, NOW, seedRuntime, withMigratedDatabase } from "./test-harness";

describe("component tool gateway", () => {
  it("loads offer context and finalizes a building instance", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const grantScopeHash = hashGrantScope(
        buildGrantScopePreimage({
          workspaceId: "ws_1",
          channelId: "ch_1",
          agentProfileId: "cw_1",
          componentVersionId: "compv_1",
        }),
      );
      await sql`
        INSERT INTO ui_component_grants (
          id, component_version_id, workspace_id, channel_id, agent_profile_id, granted_by, granted_at
        )
        VALUES ('cg_1', 'compv_1', 'ws_1', NULL, 'cw_1', 'user_1', ${NOW})
      `;
      await sql`
        UPDATE session_revisions
        SET effective_config_redacted_json = ${sql.json({
          component_tool_names: ["ui.dataTable"],
        })}
        WHERE id = 'sr_1'
      `;

      const offer = await loadComponentOfferContext(sql, {
        channelId: "ch_1",
        coworkerId: "cw_1",
        expectedSessionGeneration: 1,
        componentVersionId: "compv_1",
        expectedDescriptorHash: HASH,
        expectedGrantScopeHash: grantScopeHash,
      });
      expect(offer.ok).toBe(true);
      if (!offer.ok) {
        return;
      }
      expect(offer.value.hasActiveGrant).toBe(true);

      const finalized = await finalizeOrQuarantineUiInstance(sql, {
        uiInstanceId: "ui_1",
        expectedStatus: "building",
        expectedRenderRevision: null,
        nextRenderRevision: 1,
        renderManifestHash: HASH,
        outcome: "ready",
        now: NOW,
      });
      expect(finalized.ok).toBe(true);
      if (!finalized.ok) {
        return;
      }
      expect(finalized.value).toMatchObject({
        uiInstanceId: "ui_1",
        renderRevision: 1,
        status: "ready",
      });

      const rows = await sql<{ status: string; current_render_revision: number | null }[]>`
        SELECT status, current_render_revision
        FROM ui_instances
        WHERE id = 'ui_1'
      `;
      expect(rows[0]).toMatchObject({ status: "ready", current_render_revision: 1 });
    });
  });

  it("brokers a noninteractive MCP component tool call into a ready instance", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await sql`
        INSERT INTO ui_component_grants (
          id, component_version_id, workspace_id, channel_id, agent_profile_id, granted_by, granted_at
        )
        VALUES ('cg_mcp', 'compv_1', 'ws_1', NULL, 'cw_1', 'user_1', ${NOW})
      `;
      await sql`
        UPDATE session_revisions
        SET effective_config_redacted_json = ${sql.json({
          component_tool_names: ["ui.dataTable"],
        })}
        WHERE id = 'sr_1'
      `;

      const result = await brokerComponentToolMcpCall(sql, {
        generationId: "gen_1",
        stableName: "DataTable",
        toolCallId: "tc_mcp_1",
        props: {
          caption: "Results",
          empty_text: "No rows",
          columns: [{ key: "id", label: "ID" }],
        },
        now: NOW,
      });

      expect(result).toMatchObject({
        status: "awaiting_component_input",
        componentName: "ui.dataTable",
        renderRevision: 1,
      });
      expect(result.instanceId).toMatch(/^ui_/);

      const rows = await sql<{ status: string }[]>`
        SELECT status FROM ui_instances WHERE id = ${result.instanceId}
      `;
      expect(rows[0]?.status).toBe("ready");
    });
  });
});
