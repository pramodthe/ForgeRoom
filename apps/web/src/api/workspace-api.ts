import type {
  Channel,
  ChannelMessageCommand,
  ChannelParticipantAddCommand,
  ChannelRosterCoworker,
  ChannelRosterResponse,
  ChannelTimelineMessagesResponse,
  CoworkerProfile,
  SkillDraft,
  SkillVersion,
  TaskRecordV1,
} from "@forgeroom/contracts";
import {
  channelRosterResponseSchema,
  channelSchema,
  channelTimelineMessagesResponseSchema,
  coworkerProfileSchema,
} from "@forgeroom/contracts";
import type { ConnectionFixture } from "./mock-fixtures";
import {
  DEFAULT_CHANNEL_ID,
  MOCK_CHANNELS,
  MOCK_CONNECTIONS,
  MOCK_COWORKERS,
  MOCK_SKILL_DRAFTS,
  MOCK_SKILL_VERSIONS,
  MOCK_TASKS,
  MOCK_WORKSPACE_ID,
} from "./mock-fixtures";
import { apiFetch, ApiError, newIdempotencyKey, stripRequestId } from "./http-client";

const useMockApi = import.meta.env.MODE === "test";

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
    const members = MOCK_COWORKERS.map((coworker) => ({
      participant_id: coworker.id,
      coworker_id: coworker.id,
      handle: coworker.handle,
      name: coworker.name,
      title: coworker.title,
      role: "member" as const,
      availability: coworker.status === "disabled" ? ("disabled" as const) : ("available" as const),
      assignment_summary: null,
      effective_tools: ["demo.read", "demo.write"],
    }));
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
    return MOCK_TASKS;
  }
  // Task API arrives in later P0 tasks; keep mock-empty for live mode until then.
  return [];
}

export async function getTask(workspaceId: string, taskId: string): Promise<TaskRecordV1 | null> {
  if (useMockApi) {
    assertWorkspace(workspaceId);
    return MOCK_TASKS.find((task) => task.id === taskId) ?? null;
  }
  return null;
}

export async function listCoworkers(workspaceId: string): Promise<CoworkerProfile[]> {
  if (useMockApi) {
    assertWorkspace(workspaceId);
    return MOCK_COWORKERS;
  }
  const body = await apiFetch<{ coworkers: unknown[]; request_id: string }>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/coworkers`,
  );
  return coworkerProfileSchema.array().parse(stripRequestId(body).coworkers);
}

export async function getCoworker(
  workspaceId: string,
  coworkerId: string,
): Promise<(CoworkerProfile & { config?: unknown }) | null> {
  if (useMockApi) {
    assertWorkspace(workspaceId);
    return MOCK_COWORKERS.find((coworker) => coworker.id === coworkerId) ?? null;
  }
  try {
    const body = await apiFetch<unknown>(`/api/coworkers/${encodeURIComponent(coworkerId)}`);
    const parsed = stripRequestId(body as Record<string, unknown>);
    const profile = coworkerProfileSchema.parse(parsed);
    if (profile.workspace_id !== workspaceId) {
      return null;
    }
    return { ...profile, config: parsed.config };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
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
    const assignments = input.command.recipient_handles.flatMap((handle, index) => {
      const coworker = MOCK_COWORKERS.find((candidate) => candidate.handle === handle);
      return coworker
        ? [
            {
              run_step_id: `step_mock_${index + 1}`,
              coworker_id: coworker.id,
              logical_thread_id: `thread_mock_${coworker.id}`,
            },
          ]
        : [];
    });
    return {
      message_id: "msg_mock",
      event_id: "evt_mock",
      sequence: 1,
      recipient_handles: input.command.recipient_handles,
      routing_mode: input.command.routing_mode,
      run_id: assignments.length > 0 ? "run_mock" : null,
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
    return { schemaVersion: 1, channel_id: channelId, messages: [] };
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
    return MOCK_SKILL_VERSIONS;
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
    return MOCK_SKILL_VERSIONS.find((skill) => skill.skill_id === skillId) ?? null;
  }
  return null;
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
