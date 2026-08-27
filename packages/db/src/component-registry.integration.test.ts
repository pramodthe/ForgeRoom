import { describe, expect, it } from "vitest";
import {
  appendComponentAuditEvent,
  hasActiveComponentGrant,
  listPublishedComponentVersions,
  publishWorkspaceRegistry,
  setComponentGrant,
} from "./component-registry";
import { HASH, NOW, seedRuntime, withMigratedDatabase } from "./test-harness";

const ALT_HASH = `sha256:${"cd".repeat(32)}`;
const CHART_HASH = `sha256:${"ef".repeat(32)}`;

function metricChartDefinition(descriptorHash: string) {
  return {
    stableName: "MetricChart",
    kind: "chart",
    semanticVersion: "1.0.0",
    exposure: "agent_tool" as const,
    confirmationPolicy: "none" as const,
    modelDescription: "Single metric chart",
    argumentSchema: { type: "object" },
    rendererKey: "MetricChart@1.0.0",
    previewProps: { title: "Preview" },
    declaredDataFunctions: [],
    declaredInteractionIntents: [],
    descriptorHash,
  };
}

function dataTableDefinition(descriptorHash: string) {
  return {
    stableName: "DataTable",
    kind: "table",
    semanticVersion: "1.0.0",
    exposure: "agent_tool" as const,
    confirmationPolicy: "none" as const,
    modelDescription: "Table",
    argumentSchema: { type: "object" },
    rendererKey: "DataTable@1.0.0",
    descriptorHash,
  };
}

describe("component registry", () => {
  it("publishes twice idempotently and coexists with seeded DataTable", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);

      const first = await publishWorkspaceRegistry(sql, {
        workspaceId: "ws_1",
        publishedByUserId: "user_1",
        definitions: [metricChartDefinition(CHART_HASH), dataTableDefinition(HASH)],
        now: NOW,
      });
      expect(first).toEqual([
        {
          id: expect.any(String),
          stableName: "MetricChart",
          semanticVersion: "1.0.0",
          descriptorHash: CHART_HASH,
          exposure: "agent_tool",
        },
        {
          id: "compv_1",
          stableName: "DataTable",
          semanticVersion: "1.0.0",
          descriptorHash: HASH,
          exposure: "agent_tool",
        },
      ]);

      const second = await publishWorkspaceRegistry(sql, {
        workspaceId: "ws_1",
        publishedByUserId: "user_1",
        definitions: [metricChartDefinition(CHART_HASH), dataTableDefinition(HASH)],
        now: NOW,
      });
      expect(second).toEqual(first);

      const listed = await listPublishedComponentVersions(sql, "ws_1");
      expect(listed).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ stableName: "MetricChart", descriptorHash: CHART_HASH }),
          expect.objectContaining({ stableName: "DataTable", id: "compv_1", descriptorHash: HASH }),
        ]),
      );
    });
  }, 60_000);

  it("rejects descriptor drift on republish with a different hash", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await publishWorkspaceRegistry(sql, {
        workspaceId: "ws_1",
        publishedByUserId: "user_1",
        definitions: [metricChartDefinition(CHART_HASH)],
        now: NOW,
      });

      await expect(
        publishWorkspaceRegistry(sql, {
          workspaceId: "ws_1",
          publishedByUserId: "user_1",
          definitions: [metricChartDefinition(ALT_HASH)],
          now: NOW,
        }),
      ).rejects.toThrow(/descriptor_hash mismatch for MetricChart@1.0.0/i);
    });
  }, 60_000);

  it("rejects updates to immutable version fields", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await expect(
        sql`UPDATE ui_component_versions SET model_description = 'changed' WHERE id = 'compv_1'`,
      ).rejects.toThrow(/published content is immutable/i);
    });
  }, 60_000);

  it("defaults to deny without an active grant", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      expect(
        await hasActiveComponentGrant(sql, {
          componentVersionId: "compv_1",
          workspaceId: "ws_1",
          channelId: "ch_1",
          agentProfileId: "cw_1",
        }),
      ).toBe(false);
    });
  }, 60_000);

  it("grants then matches scope; revoke then denies", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);

      const granted = await setComponentGrant(sql, {
        componentVersionId: "compv_1",
        workspaceId: "ws_1",
        channelId: "ch_1",
        agentProfileId: "cw_1",
        grantedBy: "user_1",
      });
      expect(granted).toEqual({ grantId: expect.any(String), changed: true, action: "granted" });

      expect(
        await hasActiveComponentGrant(sql, {
          componentVersionId: "compv_1",
          workspaceId: "ws_1",
          channelId: "ch_1",
          agentProfileId: "cw_1",
        }),
      ).toBe(true);

      const noop = await setComponentGrant(sql, {
        componentVersionId: "compv_1",
        workspaceId: "ws_1",
        channelId: "ch_1",
        agentProfileId: "cw_1",
        grantedBy: "user_1",
      });
      expect(noop).toEqual({ grantId: granted.grantId, changed: false, action: "noop" });

      const revoked = await setComponentGrant(sql, {
        componentVersionId: "compv_1",
        workspaceId: "ws_1",
        channelId: "ch_1",
        agentProfileId: "cw_1",
        grantedBy: "user_1",
        granted: false,
      });
      expect(revoked).toEqual({ grantId: granted.grantId, changed: true, action: "revoked" });

      expect(
        await hasActiveComponentGrant(sql, {
          componentVersionId: "compv_1",
          workspaceId: "ws_1",
          channelId: "ch_1",
          agentProfileId: "cw_1",
        }),
      ).toBe(false);

      const regranted = await setComponentGrant(sql, {
        componentVersionId: "compv_1",
        workspaceId: "ws_1",
        channelId: "ch_1",
        agentProfileId: "cw_1",
        grantedBy: "user_1",
      });
      expect(regranted.changed).toBe(true);
      expect(regranted.grantId).not.toBe(granted.grantId);
    });
  }, 60_000);

  it("matches workspace-wide grants to any channel and coworker in that workspace", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await setComponentGrant(sql, {
        componentVersionId: "compv_1",
        workspaceId: "ws_1",
        channelId: null,
        agentProfileId: null,
        grantedBy: "user_1",
      });

      expect(
        await hasActiveComponentGrant(sql, {
          componentVersionId: "compv_1",
          workspaceId: "ws_1",
          channelId: "ch_1",
          agentProfileId: "cw_1",
        }),
      ).toBe(true);
    });
  }, 60_000);

  it("rejects grants for server_only component versions", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const [serverOnly] = await publishWorkspaceRegistry(sql, {
        workspaceId: "ws_1",
        publishedByUserId: "user_1",
        definitions: [
          {
            stableName: "HostOnlyPanel",
            kind: "form",
            semanticVersion: "1.0.0",
            exposure: "server_only",
            confirmationPolicy: "trusted_host",
            modelDescription: "Host-only surface",
            argumentSchema: { type: "object" },
            rendererKey: "HostOnlyPanel@1.0.0",
            descriptorHash: ALT_HASH,
          },
        ],
        now: NOW,
      });
      if (!serverOnly) {
        throw new Error("expected server_only version");
      }

      await expect(
        setComponentGrant(sql, {
          componentVersionId: serverOnly.id,
          workspaceId: "ws_1",
          channelId: "ch_1",
          agentProfileId: "cw_1",
          grantedBy: "user_1",
        }),
      ).rejects.toThrow(/cannot grant server_only/i);

      await expect(
        sql`
          INSERT INTO ui_component_grants (
            id, component_version_id, workspace_id, channel_id, agent_profile_id, granted_by, granted_at
          )
          VALUES (
            'ucg_direct', ${serverOnly.id}, 'ws_1', 'ch_1', 'cw_1', 'user_1', ${NOW}
          )
        `,
      ).rejects.toThrow(/cannot grant server_only/i);
    });
  }, 60_000);

  it("handles concurrent duplicate active grants via unique index", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const results = await Promise.allSettled([
        setComponentGrant(sql, {
          id: "ucg_a",
          componentVersionId: "compv_1",
          workspaceId: "ws_1",
          channelId: "ch_1",
          agentProfileId: "cw_1",
          grantedBy: "user_1",
        }),
        setComponentGrant(sql, {
          id: "ucg_b",
          componentVersionId: "compv_1",
          workspaceId: "ws_1",
          channelId: "ch_1",
          agentProfileId: "cw_1",
          grantedBy: "user_1",
        }),
      ]);

      const fulfilled = results.filter((result) => result.status === "fulfilled");
      expect(fulfilled).toHaveLength(2);
      const actions = fulfilled.map(
        (result) =>
          (result as PromiseFulfilledResult<Awaited<ReturnType<typeof setComponentGrant>>>).value
            .action,
      );
      expect(actions.filter((action) => action === "granted")).toHaveLength(1);
      expect(actions.filter((action) => action === "noop")).toHaveLength(1);

      const active = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM ui_component_grants
        WHERE component_version_id = 'compv_1'
          AND workspace_id = 'ws_1'
          AND channel_id = 'ch_1'
          AND agent_profile_id = 'cw_1'
          AND revoked_at IS NULL
      `;
      expect(active[0]?.count).toBe("1");
    });
  }, 60_000);

  it("writes component audit events with payload hash", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const payload = { stableName: "DataTable", semanticVersion: "1.0.0" };
      const event = await appendComponentAuditEvent(sql, {
        workspaceId: "ws_1",
        channelId: "ch_1",
        actorUserId: "user_1",
        action: "component.published",
        targetType: "ui_component_version",
        targetId: "compv_1",
        payload,
      });

      const [row] = await sql<{ payload_hash: string; redacted_payload_json: unknown }[]>`
        SELECT payload_hash, redacted_payload_json
        FROM audit_events
        WHERE id = ${event.id}
      `;
      expect(row?.payload_hash).toBe(event.payloadHash);
      const stored =
        typeof row?.redacted_payload_json === "string"
          ? JSON.parse(row.redacted_payload_json)
          : row?.redacted_payload_json;
      expect(stored).toEqual(payload);
    });
  }, 60_000);

  it("allows two workspaces to publish the same registry independently", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await sql`
        INSERT INTO workspaces (id, name, slug, created_by, created_at)
        VALUES ('ws_2', 'Other', 'other', 'user_1', ${NOW})
      `;
      await sql`
        INSERT INTO agent_profiles (
          id, workspace_id, handle, name, title, visibility, status,
          editable_config_json, config_revision, native_subagents_enabled, created_at, updated_at
        )
        VALUES (
          'cw_2', 'ws_2', 'foreign', 'Foreign', 'Reader', 'workspace', 'active',
          '{}'::jsonb, 1, false, ${NOW}, ${NOW}
        )
      `;

      const ws1 = await publishWorkspaceRegistry(sql, {
        workspaceId: "ws_1",
        publishedByUserId: "user_1",
        definitions: [metricChartDefinition(CHART_HASH)],
        now: NOW,
      });
      const ws2 = await publishWorkspaceRegistry(sql, {
        workspaceId: "ws_2",
        publishedByUserId: "user_1",
        definitions: [metricChartDefinition(CHART_HASH)],
        now: NOW,
      });

      expect(ws1[0]?.stableName).toBe("MetricChart");
      expect(ws2[0]?.stableName).toBe("MetricChart");
      expect(ws1[0]?.id).not.toBe(ws2[0]?.id);
      expect(ws1[0]?.descriptorHash).toBe(ws2[0]?.descriptorHash);
    });
  }, 60_000);

  it("rejects cross-workspace grants", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await sql`
        INSERT INTO workspaces (id, name, slug, created_by, created_at)
        VALUES ('ws_2', 'Other', 'other', 'user_1', ${NOW})
      `;

      await expect(
        setComponentGrant(sql, {
          componentVersionId: "compv_1",
          workspaceId: "ws_2",
          channelId: "ch_1",
          agentProfileId: "cw_1",
          grantedBy: "user_1",
        }),
      ).rejects.toThrow(/does not belong to workspace ws_2/i);
    });
  }, 60_000);

  it("excludes revoked versions from published listings", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      const published = await publishWorkspaceRegistry(sql, {
        workspaceId: "ws_1",
        publishedByUserId: "user_1",
        definitions: [metricChartDefinition(CHART_HASH), dataTableDefinition(HASH)],
        now: NOW,
      });
      const metricChart = published.find((row) => row.stableName === "MetricChart");
      if (!metricChart) {
        throw new Error("expected published MetricChart");
      }

      await sql`
        UPDATE ui_component_versions
        SET revoked_at = ${NOW}
        WHERE id = ${metricChart.id}
      `;

      const listed = await listPublishedComponentVersions(sql, "ws_1");
      expect(listed.find((row) => row.stableName === "MetricChart")).toBeUndefined();
      expect(listed.find((row) => row.stableName === "DataTable")).toBeTruthy();
    });
  }, 60_000);
});
