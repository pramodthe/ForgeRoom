import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/http-client";
import { coworkerDraftSchema } from "@forgeroom/contracts";
import {
  buildFixtureCoworkerDraft,
  clearCoworkerDraftReview,
  formatTaskRecordGrant,
  formatTaskRevisionSummary,
  friendlyApiError,
  isStaleTaskRevision,
  isTerminalCoworkerDraftState,
  parseCoworkerDraftFromError,
  persistCoworkerDraftReview,
  readCoworkerDraftReview,
  summarizeToolEffects,
} from "./review-flow-helpers";

describe("review flow helpers", () => {
  const memory = new Map<string, string>();

  beforeEach(() => {
    memory.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value);
      },
      removeItem: (key: string) => {
        memory.delete(key);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("builds a fixture coworker draft for prototype review", () => {
    const draft = buildFixtureCoworkerDraft("workspace_1", "Create a researcher");
    expect(draft.proposal.handle).toBe("researcher");
    expect(draft.effective_preview.tools.length).toBeGreaterThan(0);
  });

  it("parses stale coworker draft details from API errors", () => {
    const draft = buildFixtureCoworkerDraft("workspace_1", "Create a researcher");
    const error = new ApiError("stale_coworker_draft", "Stale draft", 409, { draft });
    expect(parseCoworkerDraftFromError(error)?.revision).toBe(draft.revision);
    expect(parseCoworkerDraftFromError(new Error("other"))).toBeNull();
  });

  it("detects stale task revision errors", () => {
    expect(isStaleTaskRevision(new ApiError("stale_task_revision", "Stale", 409))).toBe(true);
    expect(isStaleTaskRevision(new ApiError("conflict", "Other", 409))).toBe(false);
  });

  it("formats task record grants for review", () => {
    expect(
      formatTaskRecordGrant({
        channel_id: "ch_1",
        operations: ["create", "update_status"],
      }),
    ).toBe("ch_1: create, update_status");
  });

  it("round-trips coworker draft review storage keys", () => {
    persistCoworkerDraftReview("workspace_1", "cwd_123");
    expect(readCoworkerDraftReview("workspace_1")).toBe("cwd_123");
    clearCoworkerDraftReview("workspace_1");
    expect(readCoworkerDraftReview("workspace_1")).toBeNull();
  });

  it("maps common API error codes to user-facing messages", () => {
    expect(friendlyApiError(new ApiError("manifest_mismatch", "x", 409))).toContain("manifest");
    expect(friendlyApiError(new ApiError("stale_task_revision", "x", 409))).toContain(
      "updated elsewhere",
    );
  });

  it("parses coworker drafts from error details strictly", () => {
    const draft = coworkerDraftSchema.parse(buildFixtureCoworkerDraft("workspace_1", "x"));
    const error = new ApiError("stale_coworker_draft", "Stale", 409, { draft });
    expect(parseCoworkerDraftFromError(error)?.id).toBe(draft.id);
  });

  it("classifies tool effects into read, write, and destructive buckets", () => {
    const effects = summarizeToolEffects([
      "GITHUB_GET_ISSUES",
      "GITHUB_ADD_LABELS_TO_AN_ISSUE",
      "GITHUB_REMOVE_LABEL_FROM_AN_ISSUE",
    ]);
    expect(effects.read).toContain("GITHUB GET ISSUES");
    expect(effects.write).toContain("GITHUB ADD LABELS TO AN ISSUE");
    expect(effects.destructive).toContain("GITHUB REMOVE LABEL FROM AN ISSUE");
  });

  it("formats task revision summaries for history rendering", () => {
    const summary = formatTaskRevisionSummary({
      schemaVersion: 1,
      id: "trev_1",
      task_id: "task_1",
      revision: 2,
      data: { schemaVersion: 1, status: "in_progress" },
      data_hash: "sha256:abc",
      changed_fields: ["status"],
      actor_type: "human",
      actor_id: "user_1",
      command_id: "cmd_1",
      created_at: "2026-08-20T12:00:00.000Z",
    });
    expect(summary.title).toContain("in progress");
    expect(summary.detail).toContain("Revision 2");
  });

  it("recognizes terminal coworker draft states", () => {
    expect(isTerminalCoworkerDraftState("ready")).toBe(true);
    expect(isTerminalCoworkerDraftState("provisioning")).toBe(false);
  });
});
