import { describe, expect, it } from "vitest";
import type { SessionResponse } from "@forgeroom/contracts";
import { notifyApiUnauthorized, setApiUnauthorizedHandler } from "./api/unauthorized";
import { assertMockFixturesValid, MOCK_WORKSPACE_ID } from "./api/mock-fixtures";
import { getSkillVersion } from "./api/workspace-api";
import { isSessionExpired, liveSession, sessionWorkspaceMismatch } from "./auth/session";
import {
  isSafePostLoginRedirect,
  P0_ROUTE_CONTRACT,
  parseWorkspaceIdFromPath,
  postLoginDestination,
  workspaceChannelPath,
  workspaceTasksPath,
} from "./routes/paths";
import { P0_REGISTERED_ROUTES } from "./router";

describe("P0 route contract", () => {
  it("registers all UX routes", () => {
    expect(P0_REGISTERED_ROUTES).toEqual([
      "/",
      "/login",
      "/w/$workspaceId/channels",
      "/w/$workspaceId/channels/$channelId",
      "/w/$workspaceId/tasks",
      "/w/$workspaceId/tasks/$taskId",
      "/w/$workspaceId/coworkers",
      "/w/$workspaceId/coworkers/$coworkerId",
      "/w/$workspaceId/skills",
      "/w/$workspaceId/skills/$skillId",
      "/w/$workspaceId/connections",
    ]);
  });

  it("builds stable workspace paths", () => {
    expect(workspaceChannelPath(MOCK_WORKSPACE_ID, "ch_general_001")).toBe(
      "/w/workspace_1/channels/ch_general_001",
    );
    expect(workspaceTasksPath(MOCK_WORKSPACE_ID)).toBe("/w/workspace_1/tasks");
  });

  it("encodes reserved characters in dynamic path segments", () => {
    expect(workspaceChannelPath("ws/a", "ch/1")).toBe("/w/ws%2Fa/channels/ch%2F1");
    expect(parseWorkspaceIdFromPath("/w/ws%2Fa/tasks")).toBe("ws/a");
  });

  it("documents the UX path contract", () => {
    expect(P0_ROUTE_CONTRACT).toContain("/login");
    expect(P0_ROUTE_CONTRACT).toContain("/w/$workspaceId/channels/$channelId");
    expect(P0_ROUTE_CONTRACT).toContain("/w/$workspaceId/connections");
  });
});

describe("mock fixtures", () => {
  it("validates canonical contract fixtures", () => {
    expect(() => assertMockFixturesValid()).not.toThrow();
  });

  it("resolves published skills by skill_id", async () => {
    const version = await getSkillVersion(MOCK_WORKSPACE_ID, "skill_published_001");
    expect(version?.skill_id).toBe("skill_published_001");
  });
});

describe("session helpers", () => {
  const baseSession: SessionResponse = {
    request_id: "req_001",
    user: {
      id: "user_owner_001",
      email: "owner@example.test",
      display_name: "Owner",
      role: "owner",
    },
    workspace_id: MOCK_WORKSPACE_ID,
    csrf_token: "csrf_token",
    expires_at: "2099-01-01T00:00:00+00:00",
  };

  it("detects expired sessions", () => {
    expect(isSessionExpired(baseSession, new Date("2099-01-02T00:00:00Z"))).toBe(true);
    expect(isSessionExpired(baseSession, new Date("2098-12-31T00:00:00Z"))).toBe(false);
  });

  it("treats expired sessions as unauthenticated", () => {
    const expired = { ...baseSession, expires_at: "2020-01-01T00:00:00.000Z" };
    expect(liveSession(expired)).toBeNull();
    expect(liveSession(baseSession)).not.toBeNull();
  });

  it("detects workspace mismatches", () => {
    expect(sessionWorkspaceMismatch(baseSession, MOCK_WORKSPACE_ID)).toBe(false);
    expect(sessionWorkspaceMismatch(baseSession, "ws_other")).toBe(true);
  });
});

describe("postLoginDestination", () => {
  it("accepts safe workspace redirects", () => {
    expect(isSafePostLoginRedirect("/w/workspace_1/tasks")).toBe(true);
    expect(postLoginDestination("/w/workspace_1/tasks", MOCK_WORKSPACE_ID, "ch_general_001")).toBe(
      "/w/workspace_1/tasks",
    );
  });

  it("rejects unsafe redirects", () => {
    expect(isSafePostLoginRedirect("//evil.test")).toBe(false);
    expect(isSafePostLoginRedirect("/login")).toBe(false);
    expect(isSafePostLoginRedirect("https://evil.test/w/workspace_1/tasks")).toBe(false);
    expect(postLoginDestination("//evil.test", MOCK_WORKSPACE_ID, "ch_general_001")).toBe(
      "/w/workspace_1/channels/ch_general_001",
    );
  });

  it("falls back when redirect workspace id is malformed", () => {
    expect(parseWorkspaceIdFromPath("/w/%E0%A4%A/tasks")).toBeNull();
    expect(postLoginDestination("/w/%E0%A4%A/tasks", MOCK_WORKSPACE_ID, "ch_general_001")).toBe(
      "/w/workspace_1/channels/ch_general_001",
    );
  });
});

describe("api unauthorized handler", () => {
  it("notifies the registered session handler on 401", () => {
    let notified = false;
    setApiUnauthorizedHandler(() => {
      notified = true;
    });
    notifyApiUnauthorized();
    expect(notified).toBe(true);
    setApiUnauthorizedHandler(null);
  });
});
