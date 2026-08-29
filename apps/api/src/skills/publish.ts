import type { SessionResponse, SkillDraftPublishCommand, SkillVersion } from "@forgeroom/contracts";
import { skillVersionSchema } from "@forgeroom/contracts";
import { getSkillVersionById, publishSkillDraftRecord, type createSql } from "@forgeroom/db";
import type { WorkspaceServiceResult } from "../workspace/service";
import { materializeSkillMarkdown, resolveSkillStorageRoot } from "./markdown-storage";

type SqlClient = ReturnType<typeof createSql>;

async function resolveSkillDraftChannelId(
  sql: SqlClient,
  draftId: string,
  workspaceId: string,
): Promise<string | null> {
  const rows = await sql<{ channel_id: string }[]>`
    SELECT r.channel_id
    FROM skill_versions AS sv
    JOIN skills AS s ON s.id = sv.skill_id
    JOIN runs AS r ON r.id = sv.source_run_id
    WHERE sv.id = ${draftId}
      AND s.workspace_id = ${workspaceId}
    LIMIT 1
  `;
  return rows[0]?.channel_id ?? null;
}

function mapPublishError(
  code: "not_found" | "revision_mismatch" | "draft_hash_mismatch" | "source_hash_mismatch",
): WorkspaceServiceResult<SkillVersion> {
  if (code === "not_found") {
    return { ok: false, error: { code: "not_found", message: "Skill draft not found." } };
  }
  return {
    ok: false,
    error: {
      code: "validation_failed",
      message: `Skill draft publish rejected: ${code}.`,
    },
  };
}

export async function publishSkillDraftForSession(
  sql: SqlClient,
  session: SessionResponse,
  draftId: string,
  command: SkillDraftPublishCommand,
  now: () => Date,
): Promise<WorkspaceServiceResult<SkillVersion>> {
  const channelId = await resolveSkillDraftChannelId(sql, draftId, session.workspace_id);
  if (!channelId) {
    return { ok: false, error: { code: "not_found", message: "Skill draft not found." } };
  }

  const published = await publishSkillDraftRecord(sql, {
    draftId,
    workspaceId: session.workspace_id,
    channelId,
    publishedBy: session.user.id,
    expectedRevision: command.expected_revision,
    expectedDraftHash: command.expected_draft_hash,
    expectedSourceContentHash: command.expected_source_content_hash,
    now: now().toISOString(),
  });
  if (!published.ok) {
    return mapPublishError(published.code);
  }

  if (published.newlyPublished && published.markdown.length > 0) {
    const storageRoot = resolveSkillStorageRoot();
    if (storageRoot) {
      await materializeSkillMarkdown({
        rootDir: storageRoot,
        blobKey: published.blobKey,
        markdown: published.markdown,
      });
    }
  }

  return { ok: true, value: skillVersionSchema.parse(published.version) };
}

export async function getSkillVersionForSession(
  sql: SqlClient,
  session: SessionResponse,
  versionId: string,
): Promise<WorkspaceServiceResult<SkillVersion>> {
  const loaded = await getSkillVersionById(sql, versionId);
  if (!loaded || loaded.workspaceId !== session.workspace_id) {
    return { ok: false, error: { code: "not_found", message: "Skill version not found." } };
  }
  return { ok: true, value: skillVersionSchema.parse(loaded.version) };
}
