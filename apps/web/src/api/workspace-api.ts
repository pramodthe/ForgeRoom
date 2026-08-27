import type {
  Channel,
  ChannelMessageCommand,
  ChannelParticipantAddCommand,
  ChannelRosterCoworker,
  ChannelRosterResponse,
  ChannelTimelineMessage,
  ChannelTimelineMessagesResponse,
  CoworkerDisableCommand,
  CoworkerProfile,
  CoworkerUpdateCommand,
  SkillDraft,
  SkillVersion,
  TaskRecordV1,
  TaskStatus,
} from "@forgeroom/contracts";
import {
  channelRosterResponseSchema,
  channelSchema,
  channelTimelineMessagesResponseSchema,
  coworkerProfileSchema,
  coworkerUpdateCommandSchema,
  skillVersionSchema,
  taskRecordV1Schema,
} from "@forgeroom/contracts";
import type { ConnectionFixture } from "./mock-fixtures";
import {
  DEFAULT_CHANNEL_ID,
  MOCK_CHANNELS,
  MOCK_CHANNEL_MESSAGES,
  MOCK_CONNECTIONS,
  MOCK_COWORKERS,
  MOCK_SESSION,
  MOCK_SKILL_DRAFTS,
  MOCK_SKILL_VERSIONS,
  MOCK_TASKS,
  MOCK_WORKSPACE_ID,
} from "./mock-fixtures";
import { isFixtureMode } from "./mode";
import { apiFetch, ApiError, newIdempotencyKey, stripRequestId } from "./http-client";

const useMockApi = isFixtureMode;

export type CoworkerEditableConfig = Omit<
  CoworkerUpdateCommand,
  "name" | "handle" | "title" | "native_subagents_enabled"
>;

export type CoworkerDetail = CoworkerProfile & { config: CoworkerEditableConfig };

const fixtureCoworkers = new Map<string, CoworkerDetail>();
const fixtureTimelines = new Map<string, ChannelTimelineMessagesResponse>();
const fixtureTasks = new Map<string, TaskRecordV1>();
let fixtureRunSkill: SkillVersion | null = null;
const FIXTURE_COWORKER_STORAGE_PREFIX = "forgeroom:fixture:coworker:v1:";
const FIXTURE_TIMELINE_STORAGE_PREFIX = "forgeroom:fixture:timeline:v1:";
const FIXTURE_TASK_STORAGE_PREFIX = "forgeroom:fixture:task:v1:";
const FIXTURE_RUN_SKILL_STORAGE_KEY = "forgeroom:fixture:skill:v1:run_4A91";

const FIXTURE_RESEARCHER_PROFILE = coworkerProfileSchema.parse({
  schemaVersion: 1,
  id: "cw_researcher_003",
  workspace_id: MOCK_WORKSPACE_ID,
  handle: "researcher",
  name: "Researcher",
  title: "Customer research specialist",
  status: "active",
  native_subagents_enabled: false,
  current_version_id: "cwv_researcher_v1",
  config_revision: 1,
});

function defaultFixtureConfig(coworker: CoworkerProfile): CoworkerEditableConfig {
  const analyst = coworker.handle === "analyst";
  return {
    standing_instructions: analyst
      ? "Find evidence, cite sources, and summarize uncertainty. Never modify external systems."
      : "Turn approved decisions into explicit tasks and artifacts. Ask before any external write.",
    model_preset: "default",
    channel_ids: MOCK_CHANNELS.map((channel) => channel.id),
    budget: { max_turn_tokens: 12_000, max_tool_calls: 20 },
    task_record_grants: [],
    tool_grants: analyst
      ? ["GITHUB_GET_ISSUES", "SUPPORT_SEARCH", "DATATABLE_RENDER", "CHART_RENDER"]
      : ["INTERCOM_UPDATE_MACRO", "SANDBOX_RUN", "TASK_WRITE", "ARTIFACT_PUBLISH"],
    skill_version_ids: analyst ? ["skill_version_001"] : [],
    component_version_ids: [],
  };
}

function fixtureStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function readStoredFixtureCoworker(coworkerId: string): CoworkerDetail | null {
  const storage = fixtureStorage();
  if (!storage) return null;
  const storageKey = `${FIXTURE_COWORKER_STORAGE_PREFIX}${coworkerId}`;
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return null;
    const candidate = JSON.parse(raw) as Record<string, unknown>;
    const { config: rawConfig, ...rawProfile } = candidate;
    const profile = coworkerProfileSchema.parse(rawProfile);
    const command = coworkerUpdateCommandSchema.parse({
      name: profile.name,
      handle: profile.handle,
      title: profile.title,
      native_subagents_enabled: profile.native_subagents_enabled,
      ...(rawConfig as Record<string, unknown>),
    });
    const {
      name: _name,
      handle: _handle,
      title: _title,
      native_subagents_enabled: _native,
      ...config
    } = command;
    return { ...profile, config };
  } catch {
    storage.removeItem(storageKey);
    return null;
  }
}

function persistFixtureCoworker(coworker: CoworkerDetail): void {
  fixtureCoworkers.set(coworker.id, coworker);
  fixtureStorage()?.setItem(
    `${FIXTURE_COWORKER_STORAGE_PREFIX}${coworker.id}`,
    JSON.stringify(coworker),
  );
}

function storedFixtureResearcher(): CoworkerDetail | null {
  const existing = fixtureCoworkers.get(FIXTURE_RESEARCHER_PROFILE.id);
  if (existing) return existing;
  const stored = readStoredFixtureCoworker(FIXTURE_RESEARCHER_PROFILE.id);
  if (stored) fixtureCoworkers.set(stored.id, stored);
  return stored;
}

function allFixtureCoworkers(): CoworkerDetail[] {
  const coworkers = MOCK_COWORKERS.map((coworker) => fixtureCoworker(coworker));
  const researcher = storedFixtureResearcher();
  return researcher ? [...coworkers, researcher] : coworkers;
}

function findFixtureCoworker(coworkerId: string): CoworkerDetail | null {
  return allFixtureCoworkers().find((coworker) => coworker.id === coworkerId) ?? null;
}

function fixtureTimeline(channelId: string): ChannelTimelineMessagesResponse {
  const existing = fixtureTimelines.get(channelId);
  if (existing) return existing;
  const fallback =
    MOCK_CHANNEL_MESSAGES.find((timeline) => timeline.channel_id === channelId) ??
    channelTimelineMessagesResponseSchema.parse({
      schemaVersion: 1,
      channel_id: channelId,
      messages: [],
    });
  const storage = fixtureStorage();
  if (!storage) {
    fixtureTimelines.set(channelId, fallback);
    return fallback;
  }
  const storageKey = `${FIXTURE_TIMELINE_STORAGE_PREFIX}${channelId}`;
  try {
    const raw = storage.getItem(storageKey);
    const timeline = raw ? channelTimelineMessagesResponseSchema.parse(JSON.parse(raw)) : fallback;
    fixtureTimelines.set(channelId, timeline);
    return timeline;
  } catch {
    storage.removeItem(storageKey);
    fixtureTimelines.set(channelId, fallback);
    return fallback;
  }
}

function persistFixtureTimeline(timeline: ChannelTimelineMessagesResponse): void {
  fixtureTimelines.set(timeline.channel_id, timeline);
  fixtureStorage()?.setItem(
    `${FIXTURE_TIMELINE_STORAGE_PREFIX}${timeline.channel_id}`,
    JSON.stringify(timeline),
  );
}

function fixtureTask(task: TaskRecordV1): TaskRecordV1 {
  const existing = fixtureTasks.get(task.id);
  if (existing) return existing;
  const storage = fixtureStorage();
  if (storage) {
    const storageKey = `${FIXTURE_TASK_STORAGE_PREFIX}${task.id}`;
    try {
      const raw = storage.getItem(storageKey);
      if (raw) {
        const stored = taskRecordV1Schema.parse(JSON.parse(raw));
        fixtureTasks.set(stored.id, stored);
        return stored;
      }
    } catch {
      storage.removeItem(storageKey);
    }
  }
  fixtureTasks.set(task.id, task);
  return task;
}

function persistFixtureTask(task: TaskRecordV1): void {
  fixtureTasks.set(task.id, task);
  fixtureStorage()?.setItem(`${FIXTURE_TASK_STORAGE_PREFIX}${task.id}`, JSON.stringify(task));
}

function storedFixtureRunSkill(): SkillVersion | null {
  if (fixtureRunSkill) return fixtureRunSkill;
  const storage = fixtureStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(FIXTURE_RUN_SKILL_STORAGE_KEY);
    if (!raw) return null;
    fixtureRunSkill = skillVersionSchema.parse(JSON.parse(raw));
    return fixtureRunSkill;
  } catch {
    storage.removeItem(FIXTURE_RUN_SKILL_STORAGE_KEY);
    return null;
  }
}

function persistFixtureRunSkill(skill: SkillVersion): void {
  fixtureRunSkill = skill;
  fixtureStorage()?.setItem(FIXTURE_RUN_SKILL_STORAGE_KEY, JSON.stringify(skill));
}

function fixtureCoworker(coworker: CoworkerProfile): CoworkerDetail {
  const existing = fixtureCoworkers.get(coworker.id);
  if (existing) return existing;
  const stored = readStoredFixtureCoworker(coworker.id);
  if (stored) {
    fixtureCoworkers.set(stored.id, stored);
    return stored;
  }
  const detail = { ...coworker, config: defaultFixtureConfig(coworker) };
  fixtureCoworkers.set(coworker.id, detail);
  return detail;
}

function assertWorkspace(workspaceId: string): void {
  if (workspaceId !== MOCK_WORKSPACE_ID) {
    throw new Error("workspace_not_found");
  }
}

export async function listChannels(workspaceId: string): Promise<Channel[]> {
  if (useMockApi) {
    assertWorkspace(workspaceId);
    return MOCK_CHANNELS;
  }
  const body = await apiFetch<{ channels: unknown[]; request_id: string }>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/channels`,
  );
  return channelSchema.array().parse(stripRequestId(body).channels);
}

export async function getChannel(workspaceId: string, channelId: string): Promise<Channel | null> {
  if (useMockApi) {
    assertWorkspace(workspaceId);
    return MOCK_CHANNELS.find((channel) => channel.id === channelId) ?? null;
  }
  try {
    const body = await apiFetch<unknown>(`/api/channels/${encodeURIComponent(channelId)}`);
    const channel = channelSchema.parse(stripRequestId(body as { request_id: string }));
    if (channel.workspace_id !== workspaceId) {
      return null;
    }
    return channel;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function listChannelRoster(
  workspaceId: string,
  channelId: string,
): Promise<ChannelRosterResponse> {
  if (useMockApi) {
    assertWorkspace(workspaceId);
    const members = allFixtureCoworkers()
      .filter(
        (coworker) =>
          coworker.status === "active" && coworker.config.channel_ids.includes(channelId),
      )
      .map((coworker) => {
        const operatorWaiting = channelId === "ch_general_001" && coworker.handle === "operator";
        return {
          participant_id: coworker.id,
          coworker_id: coworker.id,
          handle: coworker.handle,
          name: coworker.name,
          title: coworker.title,
          role: "member" as const,
          availability: operatorWaiting ? ("needs_you" as const) : ("available" as const),
          assignment_summary: operatorWaiting
            ? "Waiting to publish billing macro"
            : "Support review complete",
          effective_tools:
            coworker.handle === "analyst"
              ? ["GITHUB_GET_ISSUES", "support.read", "DataTable", "BarOrLineChart"]
              : ["INTERCOM_UPDATE_MACRO", "sandbox.run", "TaskCard", "ArtifactCard"],
        };
      });
    return channelRosterResponseSchema.parse({
      schemaVersion: 1,
      channel_id: channelId,
      service_account_label: "Workspace service account",
      coworkers: members,
    });
  }
  const body = await apiFetch<unknown>(`/api/channels/${encodeURIComponent(channelId)}/roster`);
  const roster = channelRosterResponseSchema.parse(stripRequestId(body as { request_id: string }));
  if (roster.channel_id !== channelId) {
    throw new Error("roster_channel_mismatch");
  }
  return roster;
}

export async function listTasks(workspaceId: string): Promise<TaskRecordV1[]> {
  if (useMockApi) {
    assertWorkspace(workspaceId);
    return MOCK_TASKS.map((task) => fixtureTask(task));
  }
  // Task API arrives in later P0 tasks; keep mock-empty for live mode until then.
  return [];
}

export async function getTask(workspaceId: string, taskId: string): Promise<TaskRecordV1 | null> {
  if (useMockApi) {
    assertWorkspace(workspaceId);
    const task = MOCK_TASKS.find((candidate) => candidate.id === taskId);
    return task ? fixtureTask(task) : null;
  }
  return null;
}

export async function updateFixtureTaskStatus(input: {
  workspaceId: string;
  taskId: string;
  status: TaskStatus;
}): Promise<TaskRecordV1> {
  if (!useMockApi) throw new Error("Task updates are not connected in live mode yet.");
  assertWorkspace(input.workspaceId);
  const current = await getTask(input.workspaceId, input.taskId);
  if (!current) throw new Error("task_not_found");
  const updated = taskRecordV1Schema.parse({
    ...current,
    status: input.status,
    current_revision: current.current_revision + 1,
    updated_at: new Date().toISOString(),
  });
  persistFixtureTask(updated);
  return updated;
}

export async function listCoworkers(workspaceId: string): Promise<CoworkerProfile[]> {
  if (useMockApi) {
    assertWorkspace(workspaceId);
    return allFixtureCoworkers();
  }
  const body = await apiFetch<{ coworkers: unknown[]; request_id: string }>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/coworkers`,
  );
  return coworkerProfileSchema.array().parse(stripRequestId(body).coworkers);
}

export async function getCoworker(
  workspaceId: string,
  coworkerId: string,
): Promise<CoworkerDetail | null> {
  if (useMockApi) {
    assertWorkspace(workspaceId);
    return findFixtureCoworker(coworkerId);
  }
  try {
    const body = await apiFetch<unknown>(`/api/coworkers/${encodeURIComponent(coworkerId)}`);
    const parsed = stripRequestId(body as Record<string, unknown>);
    const profile = coworkerProfileSchema.parse(parsed);
    if (profile.workspace_id !== workspaceId) {
      return null;
    }
    return { ...profile, config: parsed.config as CoworkerEditableConfig };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function updateCoworker(input: {
  coworkerId: string;
  command: CoworkerUpdateCommand;
  csrfToken: string;
}): Promise<CoworkerDetail> {
  if (useMockApi) {
    const current = findFixtureCoworker(input.coworkerId);
    if (!current) throw new Error("coworker_not_found");
    const { name, handle, title, native_subagents_enabled: _native, ...config } = input.command;
    const updated: CoworkerDetail = {
      ...current,
      name,
      handle,
      title,
      config_revision: current.config_revision + 1,
      config,
    };
    persistFixtureCoworker(updated);
    return updated;
  }
  const body = await apiFetch<{
    coworker: unknown;
    config: CoworkerEditableConfig;
    request_id: string;
  }>(`/api/coworkers/${encodeURIComponent(input.coworkerId)}`, {
    method: "PATCH",
    csrfToken: input.csrfToken,
    body: JSON.stringify(input.command),
  });
  return { ...coworkerProfileSchema.parse(body.coworker), config: body.config };
}

export async function disableCoworker(input: {
  coworkerId: string;
  command: CoworkerDisableCommand;
  csrfToken: string;
}): Promise<CoworkerProfile> {
  if (useMockApi) {
    const current = findFixtureCoworker(input.coworkerId);
    if (!current) throw new Error("coworker_not_found");
    const disabled: CoworkerDetail = {
      ...current,
      status: "disabled",
      config_revision: current.config_revision + 1,
      config: { ...current.config, channel_ids: [], task_record_grants: [], tool_grants: [] },
    };
    persistFixtureCoworker(disabled);
    return disabled;
  }
  const body = await apiFetch<unknown>(
    `/api/coworkers/${encodeURIComponent(input.coworkerId)}/disable`,
    {
      method: "POST",
      csrfToken: input.csrfToken,
      body: JSON.stringify(input.command),
    },
  );
  return coworkerProfileSchema.parse(stripRequestId(body as { request_id: string }));
}

export async function createFixtureResearcher(workspaceId: string): Promise<CoworkerDetail> {
  if (!useMockApi) throw new Error("fixture_mode_required");
  assertWorkspace(workspaceId);
  const existing = storedFixtureResearcher();
  if (existing) return existing;
  const researcher: CoworkerDetail = {
    ...FIXTURE_RESEARCHER_PROFILE,
    config: {
      standing_instructions:
        "Analyze support and GitHub evidence, identify customer patterns, and prepare sourced briefings.",
      model_preset: "default",
      channel_ids: [DEFAULT_CHANNEL_ID],
      budget: { max_turn_tokens: 12_000, max_tool_calls: 20 },
      task_record_grants: [
        {
          channel_id: DEFAULT_CHANNEL_ID,
          operations: ["create", "update_status", "update_fields"],
        },
      ],
      tool_grants: ["SUPPORT_SEARCH", "GITHUB_GET_ISSUES"],
      skill_version_ids: ["skill_version_001"],
      component_version_ids: [],
    },
  };
  persistFixtureCoworker(researcher);
  return researcher;
}

export async function addChannelCoworker(input: {
  channelId: string;
  coworkerId: string;
  csrfToken: string;
}): Promise<void> {
  if (useMockApi) {
    return;
  }
  const command: ChannelParticipantAddCommand = {
    schemaVersion: 1,
    participant_type: "coworker",
    participant_id: input.coworkerId,
    role: "member",
    idempotency_key: newIdempotencyKey("add_participant"),
  };
  await apiFetch(`/api/channels/${encodeURIComponent(input.channelId)}/participants`, {
    method: "POST",
    csrfToken: input.csrfToken,
    body: JSON.stringify(command),
  });
}

export async function removeChannelCoworker(input: {
  channelId: string;
  coworkerId: string;
  csrfToken: string;
}): Promise<void> {
  if (useMockApi) {
    return;
  }
  await apiFetch(
    `/api/channels/${encodeURIComponent(input.channelId)}/participants/${encodeURIComponent(input.coworkerId)}`,
    {
      method: "DELETE",
      csrfToken: input.csrfToken,
      body: JSON.stringify({
        schemaVersion: 1,
        idempotency_key: newIdempotencyKey("remove_participant"),
      }),
    },
  );
}

export async function postChannelMessage(input: {
  channelId: string;
  command: ChannelMessageCommand;
  csrfToken: string;
}): Promise<{
  message_id: string;
  event_id: string;
  sequence: number;
  recipient_handles: string[];
  routing_mode: "direct" | "team";
  run_id: string | null;
  run_step_ids: string[];
  run_step_assignments: Array<{
    run_step_id: string;
    coworker_id: string;
    logical_thread_id: string;
  }>;
}> {
  if (useMockApi) {
    const timeline = fixtureTimeline(input.channelId);
    const sequence =
      Math.max(0, ...timeline.messages.map((message) => message.channel_sequence)) + 1;
    const fixtureId = crypto.randomUUID();
    const assignments = input.command.recipient_handles.flatMap((handle, index) => {
      const coworker = allFixtureCoworkers().find((candidate) => candidate.handle === handle);
      return coworker
        ? [
            {
              run_step_id: `step_mock_${fixtureId}_${index + 1}`,
              coworker_id: coworker.id,
              logical_thread_id: `thread_mock_${coworker.id}_${fixtureId}`,
            },
          ]
        : [];
    });
    const message: ChannelTimelineMessage = {
      schemaVersion: 1,
      id: `msg_mock_${fixtureId}`,
      channel_id: input.channelId,
      channel_sequence: sequence,
      author_type: "human",
      author_id: MOCK_SESSION.user.id,
      body: input.command.body,
      parent_message_id: input.command.parent_message_id,
      created_at: new Date().toISOString(),
    };
    persistFixtureTimeline({
      ...timeline,
      messages: [...timeline.messages, message].slice(-200),
    });
    return {
      message_id: message.id,
      event_id: `evt_mock_${fixtureId}`,
      sequence,
      recipient_handles: input.command.recipient_handles,
      routing_mode: input.command.routing_mode,
      run_id: assignments.length > 0 ? `run_mock_${fixtureId}` : null,
      run_step_ids: assignments.map((assignment) => assignment.run_step_id),
      run_step_assignments: assignments,
    };
  }
  const body = await apiFetch<{
    message_id: string;
    event_id: string;
    sequence: number;
    recipient_handles: string[];
    routing_mode: "direct" | "team";
    run_id: string | null;
    run_step_ids: string[];
    run_step_assignments: Array<{
      run_step_id: string;
      coworker_id: string;
      logical_thread_id: string;
    }>;
    request_id: string;
  }>(`/api/channels/${encodeURIComponent(input.channelId)}/messages`, {
    method: "POST",
    csrfToken: input.csrfToken,
    body: JSON.stringify(input.command),
  });
  const parsed = stripRequestId(body);
  return parsed;
}

export type PostedChannelMessage = Awaited<ReturnType<typeof postChannelMessage>>;

export async function listChannelMessages(
  channelId: string,
): Promise<ChannelTimelineMessagesResponse> {
  if (useMockApi) {
    return fixtureTimeline(channelId);
  }
  const body = await apiFetch<unknown>(`/api/channels/${encodeURIComponent(channelId)}/messages`);
  return channelTimelineMessagesResponseSchema.parse(
    stripRequestId(body as { request_id: string }),
  );
}

export async function listSkillDrafts(workspaceId: string): Promise<SkillDraft[]> {
  if (useMockApi) {
    assertWorkspace(workspaceId);
    return MOCK_SKILL_DRAFTS;
  }
  return [];
}

export async function listSkillVersions(workspaceId: string): Promise<SkillVersion[]> {
  if (useMockApi) {
    assertWorkspace(workspaceId);
    const runSkill = storedFixtureRunSkill();
    return runSkill ? [...MOCK_SKILL_VERSIONS, runSkill] : MOCK_SKILL_VERSIONS;
  }
  return [];
}

export async function getSkillDraft(workspaceId: string, skillId: string) {
  if (useMockApi) {
    assertWorkspace(workspaceId);
    return MOCK_SKILL_DRAFTS.find((skill) => skill.id === skillId) ?? null;
  }
  return null;
}

export async function getSkillVersion(workspaceId: string, skillId: string) {
  if (useMockApi) {
    assertWorkspace(workspaceId);
    return (
      (await listSkillVersions(workspaceId)).find((skill) => skill.skill_id === skillId) ?? null
    );
  }
  return null;
}

export async function publishFixtureRunSkill(workspaceId: string): Promise<SkillVersion> {
  if (!useMockApi) throw new Error("Skill publishing is not connected in live mode yet.");
  assertWorkspace(workspaceId);
  const existing = storedFixtureRunSkill();
  if (existing) return existing;
  const now = new Date().toISOString();
  const skill = skillVersionSchema.parse({
    schemaVersion: 1,
    id: "skill_version_support_ops_run_001",
    skill_id: "skill_support_ops_run_001",
    version: 1,
    state: "published",
    manifest_hash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    content_hash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    source_run_id: "run_4A91",
    source_step_ids: ["step_analyst_001", "step_operator_002"],
    required_tools: [
      "support.read",
      "sandbox.publish_summary",
      "TaskRecord.create",
      "INTERCOM_UPDATE_MACRO",
    ],
    required_components: [
      "component_bar_line_chart_v1",
      "component_data_table_v1",
      "component_task_card_v1",
      "component_artifact_card_v1",
    ],
    required_approvals: ["external_write"],
    created_by: MOCK_SESSION.user.id,
    created_at: now,
    published_at: now,
  });
  const operator = findFixtureCoworker("cw_operator_001");
  if (!operator || operator.status !== "active") throw new Error("operator_not_available");
  persistFixtureCoworker({
    ...operator,
    config_revision: operator.config_revision + 1,
    config: {
      ...operator.config,
      skill_version_ids: [...new Set([...operator.config.skill_version_ids, skill.id])],
    },
  });
  persistFixtureRunSkill(skill);
  return skill;
}

export async function listConnections(workspaceId: string): Promise<ConnectionFixture[]> {
  if (useMockApi) {
    assertWorkspace(workspaceId);
    return MOCK_CONNECTIONS;
  }
  return [];
}

export async function resolveDefaultChannelId(workspaceId: string): Promise<string | null> {
  if (useMockApi) {
    assertWorkspace(workspaceId);
    return DEFAULT_CHANNEL_ID;
  }
  const channels = await listChannels(workspaceId);
  return channels[0]?.id ?? null;
}

/** Sync mock-only default for tests and fixture-backed navigation helpers. */
export function defaultChannelId(): string {
  return DEFAULT_CHANNEL_ID;
}

export type { ChannelRosterCoworker };
