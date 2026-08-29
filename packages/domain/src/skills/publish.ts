import { createHash } from "node:crypto";
import type { SkillDraft, SkillVersion } from "@forgeroom/contracts";
import { canonicalizeJson } from "../components/jcs";

export type SkillPublishValidationError =
  "draft_hash_mismatch" | "source_hash_mismatch" | "revision_mismatch";

export type ValidateSkillDraftPublishInput = {
  draft: SkillDraft;
  expectedRevision: number;
  expectedDraftHash: string;
  expectedSourceContentHash: string;
};

export function validateSkillDraftPublish(
  input: ValidateSkillDraftPublishInput,
): SkillPublishValidationError | null {
  if (input.draft.revision !== input.expectedRevision) {
    return "revision_mismatch";
  }
  if (input.draft.draft_hash !== input.expectedDraftHash) {
    return "draft_hash_mismatch";
  }
  if (input.draft.source_content_hash !== input.expectedSourceContentHash) {
    return "source_hash_mismatch";
  }
  return null;
}

export function hashSkillVersionManifest(version: Omit<SkillVersion, "manifest_hash">): string {
  const preimage = {
    schemaVersion: version.schemaVersion,
    id: version.id,
    skill_id: version.skill_id,
    version: version.version,
    state: version.state,
    content_hash: version.content_hash,
    source_run_id: version.source_run_id,
    source_step_ids: [...version.source_step_ids].sort(),
    required_tools: [...version.required_tools].sort(),
    required_components: [...version.required_components].sort(),
    required_approvals: [...version.required_approvals].sort(),
    created_by: version.created_by,
    created_at: version.created_at,
    published_at: version.published_at,
  };
  return `sha256:${createHash("sha256").update(canonicalizeJson(preimage)).digest("hex")}`;
}

export function buildSkillVersionFromDraft(
  draft: SkillDraft,
  skillId: string,
  contentHash: string,
  publishedAt: string,
): SkillVersion {
  const withoutHash: Omit<SkillVersion, "manifest_hash"> = {
    schemaVersion: 1,
    id: draft.id,
    skill_id: skillId,
    version: 1,
    state: "published",
    content_hash: contentHash,
    source_run_id: draft.source_run_id,
    source_step_ids: [...draft.source_step_ids],
    required_tools: [...draft.required_tools],
    required_components: [...draft.required_components],
    required_approvals: [...draft.required_approvals],
    created_by: draft.created_by,
    created_at: draft.created_at,
    published_at: publishedAt,
  };
  return {
    ...withoutHash,
    manifest_hash: hashSkillVersionManifest(withoutHash),
  };
}

export function publishedSkillMarkdownBlobKey(skillId: string, version: number): string {
  return `skills/${skillId}/v${version}/SKILL.md`;
}
