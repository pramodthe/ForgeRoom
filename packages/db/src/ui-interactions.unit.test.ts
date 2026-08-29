import { describe, expect, it } from "vitest";
import {
  evaluateUiInteractionCommitCas,
  type UiInteractionCommitCasInput,
} from "./ui-interactions";

const BASE: UiInteractionCommitCasInput = {
  interactionState: "token_issued",
  tokenExpiresAt: "2026-08-29T12:05:00.000Z",
  now: "2026-08-29T12:00:00.000Z",
  grantAuthorityValid: true,
  actionRevokedAt: null,
  actionExpiresAt: "2026-08-29T13:00:00.000Z",
  actionMaxUses: 1,
  actionUseCount: 0,
  instanceStatus: "ready",
  currentRenderRevision: 2,
  interactionRenderRevision: 2,
  currentStateRevision: 4,
  expectedStateRevision: 4,
  channelStatus: "active",
};

describe("evaluateUiInteractionCommitCas", () => {
  it("proceeds only when token, grants, revisions and channel still match", () => {
    expect(evaluateUiInteractionCommitCas(BASE)).toEqual({ status: "proceed" });
    expect(
      evaluateUiInteractionCommitCas({
        ...BASE,
        currentStateRevision: null,
        expectedStateRevision: null,
      }),
    ).toEqual({ status: "proceed" });
  });

  it.each([
    ["interaction_not_pending", { interactionState: "succeeded" }],
    ["token_missing_or_expired", { tokenExpiresAt: null }],
    ["token_missing_or_expired", { tokenExpiresAt: BASE.now }],
    ["grant_authority_changed", { grantAuthorityValid: false }],
    ["grant_revoked_or_expired", { actionRevokedAt: BASE.now }],
    ["grant_revoked_or_expired", { actionExpiresAt: BASE.now }],
    ["grant_use_limit_reached", { actionUseCount: 1 }],
    ["instance_not_ready", { instanceStatus: "degraded" }],
    ["render_revision_changed", { currentRenderRevision: 3 }],
    ["state_revision_changed", { currentStateRevision: 5 }],
    ["channel_not_active", { channelStatus: "archived" }],
  ] as const)("returns stale for %s", (reason, overrides) => {
    expect(evaluateUiInteractionCommitCas({ ...BASE, ...overrides })).toEqual({
      status: "stale",
      reason,
      stateRevision: "currentStateRevision" in overrides ? overrides.currentStateRevision : 4,
    });
  });
});
