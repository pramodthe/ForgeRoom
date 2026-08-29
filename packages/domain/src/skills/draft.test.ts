import { describe, expect, it } from "vitest";
import { buildSkillDraft, buildSkillDraftBody, hashSkillSourceContent } from "./draft";
import type { SkillRunEvidence } from "./evidence";

const BASE_EVIDENCE: SkillRunEvidence = {
  runId: "run_demo_reconcile",
  goal: "Reconcile issue #35 with a deterministic write",
  sourceMessageBody: "Please reconcile pramodthe/ForgeRoom#35",
  lifecycle: "completed",
  sourceStepIds: ["rs_demo_read", "rs_demo_write_approval"],
  steps: [
    {
      schemaVersion: 1,
      id: "rs_demo_read",
      run_id: "run_demo_reconcile",
      assigned_coworker_id: "cw_1",
      logical_thread_id: "thread_1",
      objective: "Read the issue",
      state: "completed",
      attempt: 1,
    },
    {
      schemaVersion: 1,
      id: "rs_demo_write_approval",
      run_id: "run_demo_reconcile",
      assigned_coworker_id: "cw_1",
      logical_thread_id: "thread_1",
      objective: "Apply the approved label",
      state: "completed",
      attempt: 1,
    },
  ],
  events: [
    {
      normalizedType: "tool.succeeded",
      payloadRedacted: {
        type: "tool.succeeded",
        tool_name: "GITHUB_GET_AN_ISSUE",
        target: "pramodthe/ForgeRoom#35",
        result_summary: "Issue loaded",
      },
    },
    {
      normalizedType: "approval.decided",
      payloadRedacted: {
        type: "approval.decided",
        tool_name: "GITHUB_ADD_LABELS_TO_AN_ISSUE",
        decision: "allow",
      },
    },
    {
      normalizedType: "tool.succeeded",
      payloadRedacted: {
        type: "tool.succeeded",
        tool_name: "GITHUB_ADD_LABELS_TO_AN_ISSUE",
        target: "pramodthe/ForgeRoom#35",
        result_summary: "Label applied",
      },
    },
  ],
  approvals: [{ toolName: "GITHUB_ADD_LABELS_TO_AN_ISSUE", state: "allowed" }],
  artifacts: [{ id: "art_1", name: "reconcile-summary.md" }],
  tasks: [],
  componentVersionIds: [],
};

describe("skill draft builder", () => {
  it("builds a structured draft from normalized run evidence", () => {
    const body = buildSkillDraftBody(BASE_EVIDENCE);
    expect(body.required_tools).toEqual(["GITHUB_ADD_LABELS_TO_AN_ISSUE", "GITHUB_GET_AN_ISSUE"]);
    expect(body.required_approvals).toEqual(["host_approval_github_add_labels_to_an_issue"]);
    expect(body.method[0]).toBe("Read the issue");
    expect(body.when_to_use).toContain("Reconcile issue");
  });

  it("rejects incomplete runs", () => {
    expect(() =>
      buildSkillDraft({
        evidence: { ...BASE_EVIDENCE, lifecycle: "active" },
        workspaceId: "ws_1",
        draftId: "skd_1",
        createdBy: "user_1",
        createdAt: "2026-08-29T00:00:00.000Z",
      }),
    ).toThrow(/run_not_completed/);
  });

  it("rejects unsafe evidence payloads", () => {
    expect(() =>
      buildSkillDraft({
        evidence: {
          ...BASE_EVIDENCE,
          events: [
            {
              normalizedType: "tool.succeeded",
              payloadRedacted: { reasoning: "hidden chain of thought" },
            },
          ],
        },
        workspaceId: "ws_1",
        draftId: "skd_1",
        createdBy: "user_1",
        createdAt: "2026-08-29T00:00:00.000Z",
      }),
    ).toThrow(/unsafe_evidence/);
  });

  it("hashes source content deterministically", () => {
    const first = hashSkillSourceContent(BASE_EVIDENCE);
    const second = hashSkillSourceContent({
      ...BASE_EVIDENCE,
      events: [...BASE_EVIDENCE.events].reverse(),
    });
    expect(first).toBe(second);
    expect(first.startsWith("sha256:")).toBe(true);
  });
});
