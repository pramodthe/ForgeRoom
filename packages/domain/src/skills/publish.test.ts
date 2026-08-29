import { describe, expect, it } from "vitest";
import type { SkillDraft } from "@forgeroom/contracts";
import {
  buildSkillVersionFromDraft,
  hashSkillVersionManifest,
  validateSkillDraftPublish,
} from "./publish";

const HASH = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const DRAFT: SkillDraft = {
  schemaVersion: 1,
  id: "skd_1",
  workspace_id: "ws_1",
  revision: 1,
  draft_hash: HASH,
  source_run_id: "run_1",
  source_step_ids: ["step_1"],
  source_content_hash: HASH,
  when_to_use: "Inspect issue",
  inputs: ["issue id"],
  method: ["Read issue"],
  validation: "Confirm outcome",
  output: "Summary",
  failures: ["Stop on tool failure"],
  required_tools: ["GITHUB_GET_AN_ISSUE"],
  required_components: [],
  required_approvals: ["host_approval_github_add_labels_to_an_issue"],
  state: "draft",
  created_by: "user_1",
  created_at: "2026-08-29T00:00:00.000Z",
};

describe("skill publish helpers", () => {
  it("validates expected draft hashes before publish", () => {
    expect(
      validateSkillDraftPublish({
        draft: DRAFT,
        expectedRevision: 1,
        expectedDraftHash: HASH,
        expectedSourceContentHash: HASH,
      }),
    ).toBeNull();
    expect(
      validateSkillDraftPublish({
        draft: DRAFT,
        expectedRevision: 2,
        expectedDraftHash: HASH,
        expectedSourceContentHash: HASH,
      }),
    ).toBe("revision_mismatch");
  });

  it("builds an immutable published version manifest", () => {
    const version = buildSkillVersionFromDraft(DRAFT, "skill_1", HASH, "2026-08-29T01:00:00.000Z");
    expect(version.state).toBe("published");
    expect(version.skill_id).toBe("skill_1");
    expect(version.manifest_hash).toBe(hashSkillVersionManifest(version));
  });
});
