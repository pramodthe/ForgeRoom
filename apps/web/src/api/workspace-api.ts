import type { Channel, CoworkerProfile, TaskRecordV1 } from "@forgeroom/contracts";
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

function assertWorkspace(workspaceId: string): void {
  if (workspaceId !== MOCK_WORKSPACE_ID) {
    throw new Error("workspace_not_found");
  }
}

export async function listChannels(workspaceId: string): Promise<Channel[]> {
  assertWorkspace(workspaceId);
  return MOCK_CHANNELS;
}

export async function getChannel(workspaceId: string, channelId: string): Promise<Channel | null> {
  assertWorkspace(workspaceId);
  return MOCK_CHANNELS.find((channel) => channel.id === channelId) ?? null;
}

export async function listTasks(workspaceId: string): Promise<TaskRecordV1[]> {
  assertWorkspace(workspaceId);
  return MOCK_TASKS;
}

export async function getTask(workspaceId: string, taskId: string): Promise<TaskRecordV1 | null> {
  assertWorkspace(workspaceId);
  return MOCK_TASKS.find((task) => task.id === taskId) ?? null;
}

export async function listCoworkers(workspaceId: string): Promise<CoworkerProfile[]> {
  assertWorkspace(workspaceId);
  return MOCK_COWORKERS;
}

export async function getCoworker(
  workspaceId: string,
  coworkerId: string,
): Promise<CoworkerProfile | null> {
  assertWorkspace(workspaceId);
  return MOCK_COWORKERS.find((coworker) => coworker.id === coworkerId) ?? null;
}

export async function listSkillDrafts(workspaceId: string) {
  assertWorkspace(workspaceId);
  return MOCK_SKILL_DRAFTS;
}

export async function listSkillVersions(workspaceId: string) {
  assertWorkspace(workspaceId);
  return MOCK_SKILL_VERSIONS;
}

export async function getSkillDraft(workspaceId: string, skillId: string) {
  assertWorkspace(workspaceId);
  return MOCK_SKILL_DRAFTS.find((skill) => skill.id === skillId) ?? null;
}

export async function getSkillVersion(workspaceId: string, skillId: string) {
  assertWorkspace(workspaceId);
  return MOCK_SKILL_VERSIONS.find((skill) => skill.skill_id === skillId) ?? null;
}

export async function listConnections(workspaceId: string): Promise<ConnectionFixture[]> {
  assertWorkspace(workspaceId);
  return MOCK_CONNECTIONS;
}

export function defaultChannelId(): string {
  return DEFAULT_CHANNEL_ID;
}
