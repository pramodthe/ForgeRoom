import type { SkillDraft, SkillDraftCreateCommand, SessionResponse } from "@forgeroom/contracts";
import { skillDraftSchema } from "@forgeroom/contracts";
import { SkillDraftBuildError } from "@forgeroom/domain";
import {
  createSkillDraftRecord,
  getSkillDraftById,
  loadSkillRunEvidence,
  slugifySkillStableName,
  type createSql,
} from "@forgeroom/db";
import type { TrueForgeClient } from "@forgeroom/trueforge";
import type { WorkspaceServiceResult } from "../workspace/service";
import { buildSkillDraftBodyForCreate, SkillDraftTurnError } from "./draft-turn";

type SqlClient = ReturnType<typeof createSql>;

export async function getSkillDraftForSession(
  sql: SqlClient,
  session: SessionResponse,
  draftId: string,
): Promise<WorkspaceServiceResult<SkillDraft>> {
  const loaded = await getSkillDraftById(sql, draftId);
  if (!loaded || loaded.workspaceId !== session.workspace_id) {
    return { ok: false, error: { code: "not_found", message: "Skill draft not found." } };
  }
  return { ok: true, value: skillDraftSchema.parse(loaded.draft) };
}

export async function createSkillDraftForRun(
  sql: SqlClient,
  session: SessionResponse,
  runId: string,
  command: SkillDraftCreateCommand,
  now: () => Date,
  ids: { draftId: string; skillId: string },
  deps?: { trueforgeClient?: TrueForgeClient },
): Promise<WorkspaceServiceResult<SkillDraft>> {
  const loaded = await loadSkillRunEvidence(sql, {
    runId,
    workspaceId: session.workspace_id,
    sourceStepIds: command.source_step_ids,
  });
  if (!loaded.ok) {
    return {
      ok: false,
      error: {
        code: loaded.code,
        message: loaded.message,
      },
    };
  }

  const createdAt = now().toISOString();

  try {
    const draftBody = await buildSkillDraftBodyForCreate(
      loaded.evidence,
      deps?.trueforgeClient
        ? {
            client: deps.trueforgeClient,
          }
        : undefined,
    );
    const draft = await createSkillDraftRecord(sql, {
      workspaceId: loaded.workspaceId,
      channelId: loaded.channelId,
      createdBy: session.user.id,
      draftId: ids.draftId,
      skillId: ids.skillId,
      stableName: slugifySkillStableName(loaded.evidence.goal, loaded.evidence.runId),
      displayName: loaded.evidence.goal,
      evidence: loaded.evidence,
      now: createdAt,
      draftBody,
    });
    return { ok: true, value: draft };
  } catch (error) {
    if (error instanceof SkillDraftBuildError || error instanceof SkillDraftTurnError) {
      return {
        ok: false,
        error: {
          code: "validation_failed",
          message: error.message,
        },
      };
    }
    throw error;
  }
}
