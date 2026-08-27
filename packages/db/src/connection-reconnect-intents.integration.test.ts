import { describe, expect, it } from "vitest";
import { seedRuntime, withMigratedDatabase } from "./test-harness";
import {
  deleteExpiredConnectionReconnectIntents,
  findActiveReconnectIntentForActor,
  findLatestReconnectIntentForConnection,
  findReconnectIntentByIdempotencyKey,
  saveConnectionReconnectIntent,
} from "./connection-reconnect-intents";

const CONNECTION_ID = "cb_1";

describe("connection reconnect intents", () => {
  it("persists, idempotently reloads, and deletes expired rows", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);

      const intent = {
        intentId: "crec_test_1",
        connectionId: CONNECTION_ID,
        workspaceId: "ws_1",
        actorUserId: "user_1",
        idempotencyKey: "reconnect-1",
        expectedConnectedAccountId: "ca_pinned",
        redirectUrl: "https://connect.composio.dev/link/test",
        expiresAt: "2099-01-01T00:00:00.000Z",
        provisionalConnectedAccountId: "ca_provisional",
        createdAt: "2026-01-01T00:00:00.000Z",
      };

      await saveConnectionReconnectIntent(sql, intent);
      const byKey = await findReconnectIntentByIdempotencyKey(sql, {
        workspaceId: intent.workspaceId,
        connectionId: intent.connectionId,
        actorUserId: intent.actorUserId,
        idempotencyKey: intent.idempotencyKey,
      });
      expect(byKey?.intentId).toBe(intent.intentId);

      await saveConnectionReconnectIntent(sql, {
        ...intent,
        intentId: "crec_test_2",
        redirectUrl: "https://connect.composio.dev/link/other",
      });
      const stillOriginal = await findReconnectIntentByIdempotencyKey(sql, {
        workspaceId: intent.workspaceId,
        connectionId: intent.connectionId,
        actorUserId: intent.actorUserId,
        idempotencyKey: intent.idempotencyKey,
      });
      expect(stillOriginal?.intentId).toBe(intent.intentId);
      expect(stillOriginal?.redirectUrl).toBe(intent.redirectUrl);

      const active = await findActiveReconnectIntentForActor(sql, {
        workspaceId: intent.workspaceId,
        connectionId: intent.connectionId,
        actorUserId: intent.actorUserId,
      });
      expect(active?.intentId).toBe(intent.intentId);

      const latest = await findLatestReconnectIntentForConnection(sql, {
        workspaceId: intent.workspaceId,
        connectionId: intent.connectionId,
      });
      expect(latest?.intentId).toBe(intent.intentId);

      await deleteExpiredConnectionReconnectIntents(sql, "2100-01-01T00:00:00.000Z");
      const afterCleanup = await findLatestReconnectIntentForConnection(sql, {
        workspaceId: intent.workspaceId,
        connectionId: intent.connectionId,
      });
      expect(afterCleanup).toBeNull();
    });
  }, 60_000);
});
