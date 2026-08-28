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

      const rows = await sql<
        { status: string; render_grant_id: string | null }[]
      >`SELECT status, render_grant_id FROM ui_instances WHERE id = ${result.instanceId}`;
      expect(rows[0]).toMatchObject({ status: "ready", render_grant_id: expect.any(String) });

      const revisions = await sql<{ render_node_set_json: unknown }[]>`
        SELECT render_node_set_json
        FROM ui_instance_revisions
        WHERE ui_instance_id = ${result.instanceId}
      `;
      const renderNodeSet = revisions[0]?.render_node_set_json;
      expect(
        typeof renderNodeSet === "string" ? JSON.parse(renderNodeSet) : renderNodeSet,
      ).toEqual([{ nodeId: "node_1" }]);

      const channelEvents = await sql<{ agui_event_type: string | null; sequence: number }[]>`
        SELECT agui_event_type, sequence
        FROM channel_events
        WHERE channel_id = 'ch_1'
        ORDER BY sequence ASC
      `;
      expect(channelEvents).toEqual([
        { agui_event_type: null, sequence: 0 },
        { agui_event_type: "ACTIVITY_SNAPSHOT", sequence: 1 },
      ]);
    });
  });

  it("brokers TaskCard with a render grant and channel projection", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await sql`
        INSERT INTO ui_components (
          id, workspace_id, stable_name, kind, status, created_by, created_at, updated_at
        )
        VALUES ('comp_task', 'ws_1', 'TaskCard', 'report', 'active', 'user_1', ${NOW}, ${NOW})
      `;
      await sql`
        INSERT INTO ui_component_versions (
          id, component_id, semantic_version, exposure, confirmation_policy, model_description,
          argument_schema_json, renderer_key, descriptor_hash, published_by, published_at
        )
        VALUES (
          'compv_task', 'comp_task', '1.0.0', 'agent_tool', 'none', 'Task card',
          '{}'::jsonb, 'TaskCard@1.0.0', ${HASH}, 'user_1', ${NOW}
        )
      `;
      await sql`
        UPDATE ui_components SET current_published_version_id = 'compv_task' WHERE id = 'comp_task'
      `;
      await sql`
        INSERT INTO ui_component_grants (
          id, component_version_id, workspace_id, channel_id, agent_profile_id, granted_by, granted_at
        )
        VALUES ('cg_task', 'compv_task', 'ws_1', NULL, 'cw_1', 'user_1', ${NOW})
      `;
      await sql`
        UPDATE session_revisions
        SET effective_config_redacted_json = ${sql.json({
          component_tool_names: ["ui.taskCard"],
        })}
        WHERE id = 'sr_1'
      `;

      const result = await brokerComponentToolMcpCall(sql, {
        generationId: "gen_1",
        stableName: "TaskCard",
        toolCallId: "tc_task_1",
        props: {
          heading: "Demo task",
          show_description: true,
          show_assignee: true,
          show_due_date: false,
          show_history: true,
        },
        now: NOW,
      });

      expect(result).toMatchObject({
        status: "ready",
        componentName: "ui.taskCard",
        renderRevision: 1,
      });

      const [instance] = await sql<{ render_grant_id: string | null }[]>`
        SELECT render_grant_id FROM ui_instances WHERE id = ${result.instanceId}
      `;
      expect(instance?.render_grant_id).toEqual(expect.any(String));
    });
  });
});
