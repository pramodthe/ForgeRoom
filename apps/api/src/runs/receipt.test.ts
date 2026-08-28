import { describe, expect, it } from "vitest";
import type { SessionResponse } from "@forgeroom/contracts";
import { createMemoryWorkspaceStore } from "../workspace/store";
import { createWorkspaceService } from "../workspace/service";

const SESSION: SessionResponse = {
  request_id: "req_test",
  user: { id: "user_1", email: "owner@example.test", display_name: "Owner", role: "owner" },
  workspace_id: "workspace_1",
  csrf_token: "csrf_test",
  expires_at: "2026-08-29T00:00:00.000Z",
};

describe("getRunReceipt memory store", () => {
  it("requires database backing for receipt export", async () => {
    const workspace = createWorkspaceService({ store: createMemoryWorkspaceStore() });
    const result = await workspace.getRunReceipt(SESSION, "run_missing");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("not_found");
    expect(result.error.message).toContain("database");
  });
});
