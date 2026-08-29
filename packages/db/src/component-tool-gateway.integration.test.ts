import { describe, expect, it } from "vitest";
import { buildGrantScopePreimage, getRegistryDefinition, hashGrantScope } from "@forgeroom/domain";
import {
  brokerComponentToolMcpCall,
  finalizeOrQuarantineUiInstance,
  loadComponentOfferContext,
  recheckBrokerComponentAuthority,
} from "./component-tool-gateway";
import { createSql } from "./client";
import { migrate } from "./migrate";
import {
  HASH,
  NOW,
  alignSeededDataTableToRegistry,
  seedRuntime,
  withMigratedDatabase,
  withTemporaryDatabase,
} from "./test-harness";

const TASK_CARD_DESCRIPTOR_HASH = getRegistryDefinition("TaskCard")!.descriptorHash;

async function seedBrokeredDataTable(sql: Parameters<typeof seedRuntime>[0]): Promise<{
  componentVersionId: string;
  descriptorHash: string;
}> {
  const aligned = await alignSeededDataTableToRegistry(sql);
  await sql`
    INSERT INTO ui_component_grants (
      id, component_version_id, workspace_id, channel_id, agent_profile_id, granted_by, granted_at
    )
    VALUES ('cg_broker', ${aligned.componentVersionId}, 'ws_1', NULL, 'cw_1', 'user_1', ${NOW})
  `;
  await sql`
    UPDATE session_revisions
    SET effective_config_redacted_json = ${sql.json({
      component_tool_names: ["ui.dataTable"],
    })}
    WHERE id = 'sr_1'
  `;
  return aligned;
}

/**
 * Resolves once some backend other than this one is blocked waiting on a lock.
 * A fixed delay cannot tell "the broker is parked at checkpoint 2" apart from
 * "the broker has not reached it yet", so a slow run would release the revocation
 * early and pass without exercising the FOR SHARE at all. Without the lock nothing
 * ever blocks here, so the negative control fails on any machine rather than by luck.
 */
async function waitForLockWaiter(probe: ReturnType<typeof createSql>): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const waiting = await probe<{ pid: number }[]>`
      SELECT pid
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND wait_event_type = 'Lock'
      LIMIT 1
    `;
    if (waiting.length > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(
    "Broker never blocked on the authority rows; checkpoint 2 is not taking FOR SHARE.",
  );
}

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
      await seedBrokeredDataTable(sql);

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

      const rows = await sql<{ status: string; render_grant_id: string | null }[]>`
        SELECT status, render_grant_id FROM ui_instances WHERE id = ${result.instanceId}
      `;
      expect(rows[0]).toMatchObject({ status: "ready", render_grant_id: expect.any(String) });

      const revisions = await sql<{ render_node_set_json: unknown }[]>`
        SELECT render_node_set_json
        FROM ui_instance_revisions
        WHERE ui_instance_id = ${result.instanceId}
      `;
      const renderNodeSet = revisions[0]?.render_node_set_json;
      expect(typeof renderNodeSet === "string" ? JSON.parse(renderNodeSet) : renderNodeSet).toEqual(
        [{ nodeId: "node_1" }],
      );

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

  it("provisions broker DataGrants when a data-function grant exists", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const aligned = await seedBrokeredDataTable(sql);
      await sql`
        INSERT INTO ui_data_function_grants (
          id, component_version_id, function_name, workspace_id, limits_json, granted_by, granted_at
        )
        VALUES (
          'dfg_rows', ${aligned.componentVersionId}, 'rows', 'ws_1', '{"max_rows":10}'::jsonb,
          'user_1', ${NOW}
        )
      `;

      const result = await brokerComponentToolMcpCall(sql, {
        generationId: "gen_1",
        stableName: "DataTable",
        toolCallId: "tc_rows_1",
        props: {
          caption: "Results",
          empty_text: "No rows",
          columns: [{ key: "record_id", label: "Record" }],
        },
        now: NOW,
      });

      expect(result).toMatchObject({
        status: "awaiting_component_input",
        renderRevision: 1,
      });

      const dataGrants = await sql<
        { grant_kind: string; data_ref: string | null; max_rows: number | null }[]
      >`
        SELECT grant_kind, data_ref, max_rows
        FROM ui_surface_grants
        WHERE ui_instance_id = ${result.instanceId}
          AND grant_kind = 'data'
      `;
      expect(dataGrants).toEqual([{ grant_kind: "data", data_ref: "rows", max_rows: 10 }]);

      const revisions = await sql<{ data_snapshot_json: unknown }[]>`
        SELECT data_snapshot_json
        FROM ui_instance_revisions
        WHERE ui_instance_id = ${result.instanceId}
          AND revision_kind = 'render'
      `;
      const snapshot = revisions[0]?.data_snapshot_json;
      expect(typeof snapshot === "string" ? JSON.parse(snapshot) : snapshot).toEqual({ rows: [] });
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
          '{}'::jsonb, 'TaskCard@1.0.0', ${TASK_CARD_DESCRIPTOR_HASH}, 'user_1', ${NOW}
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

  it("quarantines when publication/descriptor drifts before instance creation", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const aligned = await seedBrokeredDataTable(sql);

      const props = {
        caption: "Results",
        empty_text: "No rows",
        columns: [{ key: "id", label: "ID" }],
      };
      const postArgs = await recheckBrokerComponentAuthority(sql, {
        workspaceId: "ws_1",
        channelId: "ch_1",
        coworkerId: "cw_1",
        stableName: "DataTable",
        props,
        expectedSessionGeneration: 1,
      });
      expect(postArgs.ok).toBe(true);
      if (!postArgs.ok) {
        return;
      }
      expect(postArgs.value.componentVersionId).toBe(aligned.componentVersionId);

      // Point publication back at the seeded HASH version (immutable rows cannot be mutated).
      await sql`
        UPDATE ui_components
        SET current_published_version_id = 'compv_1'
        WHERE id = 'comp_1'
      `;

      const beforeCreate = await recheckBrokerComponentAuthority(sql, {
        workspaceId: "ws_1",
        channelId: "ch_1",
        coworkerId: "cw_1",
        stableName: "DataTable",
        props,
        expectedSessionGeneration: 1,
        expected: {
          componentVersionId: postArgs.value.componentVersionId,
          descriptorHash: postArgs.value.descriptorHash,
          grantScopeHash: postArgs.value.grantScopeHash,
        },
      });
      expect(beforeCreate).toEqual({
        ok: false,
        code: "descriptor_mismatch",
        message: "Published descriptor hash does not match the code-owned registry.",
      });

      const brokered = await brokerComponentToolMcpCall(sql, {
        generationId: "gen_1",
        stableName: "DataTable",
        toolCallId: "tc_descriptor_drift",
        props,
        now: NOW,
      });
      expect(brokered).toMatchObject({
        status: "quarantined",
        instanceId: "",
      });
    });
  }, 60_000);

  it("quarantines when the component grant is revoked before broker finalize", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await alignSeededDataTableToRegistry(sql);
      await sql`
        UPDATE session_revisions
        SET effective_config_redacted_json = ${sql.json({
          component_tool_names: ["ui.dataTable"],
        })}
        WHERE id = 'sr_1'
      `;

      const brokered = await brokerComponentToolMcpCall(sql, {
        generationId: "gen_1",
        stableName: "DataTable",
        toolCallId: "tc_ungranted",
        props: {
          caption: "Results",
          empty_text: "No rows",
          columns: [{ key: "id", label: "ID" }],
        },
        now: NOW,
      });
      expect(brokered).toMatchObject({
        status: "quarantined",
        instanceId: "",
        textAlternative: "Component grant is missing or revoked.",
      });
    });
  }, 60_000);

  it("quarantines instead of persisting an instance when a grant revocation commits during create", async () => {
    await withTemporaryDatabase(async (url) => {
      // Three connections: the broker, an uncommitted revocation, and a probe that
      // observes whether the broker is actually blocked on the lock.
      const sql = createSql(url);
      const revoker = createSql(url);
      const probe = createSql(url);
      try {
        await migrate(sql);
        await seedRuntime(sql);
        await seedBrokeredDataTable(sql);

        let holdingRowLock = (): void => undefined;
        const rowLockHeld = new Promise<void>((resolve) => {
          holdingRowLock = resolve;
        });
        let releaseRevoker = (): void => undefined;
        const revokerReleased = new Promise<void>((resolve) => {
          releaseRevoker = resolve;
        });

        const revoked = revoker.begin(async (tx) => {
          await tx`
            UPDATE ui_component_grants SET revoked_at = ${NOW} WHERE id = 'cg_broker'
          `;
          holdingRowLock();
          // Held until the broker is provably parked on the lock, never on a timer.
          await revokerReleased;
        });

        // Start the broker only once the revocation actually holds the row lock,
        // otherwise the broker can win the race and the test proves nothing.
        await rowLockHeld;
        const brokered = brokerComponentToolMcpCall(sql, {
          generationId: "gen_1",
          stableName: "DataTable",
          toolCallId: "tc_revoke_race",
          props: {
            caption: "Results",
            empty_text: "No rows",
            columns: [{ key: "id", label: "ID" }],
          },
          now: NOW,
        });
        brokered.catch(() => undefined);

        try {
          await waitForLockWaiter(probe);
        } finally {
          releaseRevoker();
        }
        await revoked;
        const result = await brokered;

        // Checkpoint 2 blocked behind the revoker and re-evaluated once it committed.
        // Without the lock it reads the pre-revocation snapshot and persists an
        // instance whose authority has been withdrawn.
        expect(result).toMatchObject({
          status: "quarantined",
          instanceId: "",
          renderRevision: null,
        });

        const instances = await sql<{ id: string }[]>`
          SELECT id FROM ui_instances WHERE tool_call_id = 'tc_revoke_race'
        `;
        expect(instances).toHaveLength(0);
      } finally {
        await probe.end({ timeout: 5 });
        await revoker.end({ timeout: 5 });
        await sql.end({ timeout: 5 });
      }
    });
  }, 60_000);
});
