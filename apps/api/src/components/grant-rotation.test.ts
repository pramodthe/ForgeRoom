import { describe, expect, it, vi } from "vitest";
import { loadCurrentSessionComponentToolNames, setComponentGrant } from "@forgeroom/db";
import { seedRuntime, withMigratedDatabase } from "@forgeroom/db/test-harness";
import { TrueForgeClient } from "@forgeroom/trueforge";
import { createPostgresWorkspaceStore } from "../workspace/postgres-store";
import { rotateComponentGrantSessions } from "./grant-rotation";

describe("rotateComponentGrantSessions", () => {
  it("reconciles an already-applied component generation without rotating again", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      expect(await loadCurrentSessionComponentToolNames(sql, "cas_1")).toBeNull();
      await setComponentGrant(sql, {
        componentVersionId: "compv_1",
        workspaceId: "ws_1",
        channelId: null,
        agentProfileId: "cw_1",
        grantedBy: "user_1",
      });
      await sql`
        UPDATE session_revisions
        SET effective_config_redacted_json = ${sql.json({
          component_tool_names: ["ui.dataTable"],
        })}
        WHERE id = 'sr_1'
      `;

      const fetchImpl = vi.fn(async () => {
        throw new Error("reconciled rotation must not call TrueForge");
      });
      const client = new TrueForgeClient({
        baseUrl: "http://trueforge.test",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });

      await rotateComponentGrantSessions({
        sql,
        store: createPostgresWorkspaceStore(sql),
        client,
        workspaceId: "ws_1",
        coworkerId: "cw_1",
        sessionIds: ["cas_1"],
        createdBy: "user_1",
        reason: "component_grant",
        operationId: "audit_1:cas_1",
        operationStartedAt: "2026-08-28T00:00:00.000Z",
        reconcile: true,
      });

      expect(fetchImpl).not.toHaveBeenCalled();
    });
  }, 60_000);
});
