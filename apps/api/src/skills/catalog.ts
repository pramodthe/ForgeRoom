import type { SkillDraft, SkillVersion, SessionResponse } from "@forgeroom/contracts";
import { skillDraftSchema, skillVersionSchema } from "@forgeroom/contracts";
import {
  getPublishedSkillVersionBySkillId,
  getSkillDraftBySkillId,
  listWorkspaceSkillDrafts,
  listWorkspaceSkillVersions,
  type createSql,
} from "@forgeroom/db";
import type { WorkspaceServiceResult } from "../workspace/service";

type SqlClient = ReturnType<typeof createSql>;

export async function listWorkspaceSkillsForSession(
  sql: SqlClient,
  session: SessionResponse,
  workspaceId: string,
): Promise<WorkspaceServiceResult<{ drafts: SkillDraft[]; versions: SkillVersion[] }>> {
  if (workspaceId !== session.workspace_id) {
    return { ok: false, error: { code: "not_found", message: "Workspace not found." } };
  }
  const [drafts, versions] = await Promise.all([
    listWorkspaceSkillDrafts(sql, workspaceId),
    listWorkspaceSkillVersions(sql, workspaceId),
  ]);
  return {
    ok: true,
    value: {
      drafts: drafts.map((draft) => skillDraftSchema.parse(draft)),
      versions: versions.map((version) => skillVersionSchema.parse(version)),
    },
  };
}

export async function getSkillDraftBySkillForSession(
  sql: SqlClient,
  session: SessionResponse,
  skillId: string,
): Promise<WorkspaceServiceResult<SkillDraft>> {
  const draft = await getSkillDraftBySkillId(sql, session.workspace_id, skillId);
  if (!draft) {
    return { ok: false, error: { code: "not_found", message: "Skill draft not found." } };
  }
  return { ok: true, value: skillDraftSchema.parse(draft) };
}

export async function getSkillVersionBySkillForSession(
  sql: SqlClient,
  session: SessionResponse,
  skillId: string,
): Promise<WorkspaceServiceResult<SkillVersion>> {
  const version = await getPublishedSkillVersionBySkillId(sql, session.workspace_id, skillId);
  if (!version) {
    return { ok: false, error: { code: "not_found", message: "Skill version not found." } };
  }
  return { ok: true, value: skillVersionSchema.parse(version) };
}
