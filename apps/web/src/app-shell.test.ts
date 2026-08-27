import { describe, expect, it } from "vitest";
import type { SessionResponse } from "@forgeroom/contracts";
import { notifyApiUnauthorized, setApiUnauthorizedHandler } from "./api/unauthorized";
import { assertMockFixturesValid, MOCK_WORKSPACE_ID } from "./api/mock-fixtures";
import { fixtureModeFor } from "./api/mode";
import {
  createFixtureResearcher,
  disableCoworker,
  getCoworker,
  getSkillVersion,
  listChannelMessages,
  listChannelRoster,
  listCoworkers,
  listSkillVersions,
  listTasks,
  postChannelMessage,
  publishFixtureRunSkill,
  updateCoworker,
  updateFixtureTaskStatus,
} from "./api/workspace-api";
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
  it("cannot enable fixture mode in production", () => {
    expect(fixtureModeFor("production")).toBe(false);
    expect(fixtureModeFor("prototype")).toBe(true);
  });

  it("validates canonical contract fixtures", () => {
    expect(() => assertMockFixturesValid()).not.toThrow();
  });

  it("resolves published skills by skill_id", async () => {
    const version = await getSkillVersion(MOCK_WORKSPACE_ID, "skill_published_001");
    expect(version?.skill_id).toBe("skill_published_001");
  });

  it("gives every fixture send a distinct identity and increasing sequence", async () => {
    const command = {
      body: "@operator Check the fixture",
      recipient_handles: ["operator"],
      routing_mode: "direct" as const,
      parent_message_id: null,
    };
    const first = await postChannelMessage({
      channelId: "ch_general_001",
      command,
      csrfToken: "fixture",
    });
    const second = await postChannelMessage({
      channelId: "ch_general_001",
      command,
      csrfToken: "fixture",
    });
    expect(second.message_id).not.toBe(first.message_id);
    expect(second.run_id).not.toBe(first.run_id);
    expect(second.sequence).toBe(first.sequence + 1);
    const timeline = await listChannelMessages("ch_general_001");
    expect(timeline.messages.at(-1)).toMatchObject({
      id: second.message_id,
      body: command.body,
      channel_sequence: second.sequence,
    });
  });

  it("persists fixture coworker edits and disable state through the API adapter", async () => {
    const current = await getCoworker(MOCK_WORKSPACE_ID, "cw_analyst_002");
    expect(current).not.toBeNull();
    if (!current) return;
    const updated = await updateCoworker({
      coworkerId: current.id,
      csrfToken: "fixture",
      command: {
        name: "Analyst Plus",
        handle: current.handle,
        title: current.title,
        standing_instructions: "Cite every source.",
        model_preset: current.config.model_preset,
        native_subagents_enabled: false,
        channel_ids: current.config.channel_ids,
        budget: current.config.budget,
        task_record_grants: current.config.task_record_grants,
        tool_grants: current.config.tool_grants,
        skill_version_ids: current.config.skill_version_ids,
        component_version_ids: current.config.component_version_ids,
      },
    });
    expect((await getCoworker(MOCK_WORKSPACE_ID, current.id))?.name).toBe("Analyst Plus");
    const disabled = await disableCoworker({
      coworkerId: current.id,
      csrfToken: "fixture",
      command: {
        schemaVersion: 1,
        expected_config_revision: updated.config_revision,
        reason: "test",
        idempotency_key: "disable_fixture_test",
      },
    });
    expect(disabled.status).toBe("disabled");
    expect((await getCoworker(MOCK_WORKSPACE_ID, current.id))?.config.channel_ids).toEqual([]);
    const roster = await listChannelRoster(MOCK_WORKSPACE_ID, "ch_general_001");
    expect(roster.coworkers.some((coworker) => coworker.coworker_id === current.id)).toBe(false);
  });

  it("adds the fixture researcher to the coworker directory and General roster", async () => {
    const researcher = await createFixtureResearcher(MOCK_WORKSPACE_ID);
    expect((await listCoworkers(MOCK_WORKSPACE_ID)).map((coworker) => coworker.id)).toContain(
      researcher.id,
    );
    const roster = await listChannelRoster(MOCK_WORKSPACE_ID, "ch_general_001");
    expect(roster.coworkers.map((coworker) => coworker.coworker_id)).toContain(researcher.id);
    const posted = await postChannelMessage({
      channelId: "ch_general_001",
      csrfToken: "fixture",
      command: {
        body: "@researcher Summarize the evidence",
        recipient_handles: [researcher.handle],
        routing_mode: "direct",
        parent_message_id: null,
      },
    });
    expect(posted.run_id).not.toBeNull();
    expect(posted.run_step_assignments).toEqual([
      expect.objectContaining({ coworker_id: researcher.id }),
    ]);
  });

  it("persists fixture task transitions as new revisions", async () => {
    const before = (await listTasks(MOCK_WORKSPACE_ID))[0];
    expect(before).toBeDefined();
    if (!before) return;
    const updated = await updateFixtureTaskStatus({
      workspaceId: MOCK_WORKSPACE_ID,
      taskId: before.id,
      status: "done",
    });
    expect(updated.status).toBe("done");
    expect(updated.current_revision).toBe(before.current_revision + 1);
    expect((await listTasks(MOCK_WORKSPACE_ID))[0]?.status).toBe("done");
  });

  it("publishes the fixture run skill and binds it to Operator", async () => {
    const skill = await publishFixtureRunSkill(MOCK_WORKSPACE_ID);
    expect((await listSkillVersions(MOCK_WORKSPACE_ID)).map((version) => version.id)).toContain(
      skill.id,
    );
    const operator = await getCoworker(MOCK_WORKSPACE_ID, "cw_operator_001");
    expect(operator?.config.skill_version_ids).toContain(skill.id);
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
