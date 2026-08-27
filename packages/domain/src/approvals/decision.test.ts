import { describe, expect, it } from "vitest";
import {
  buildApprovalCard,
  evaluateApprovalDecisionGate,
  hashActingIdentity,
  type ProposalDecisionSnapshot,
} from "./decision";

const HASH = `sha256:${"ab".repeat(32)}`;
const NOW = "2026-08-25T23:00:00.000Z";
const EXPIRES = "2026-08-26T23:00:00.000Z";

const acting = {
  service: "github",
  account_display: "fixture-org",
  principal_type: "bot" as const,
  principal_display: "fixture-bot",
  principal_id_hash: HASH,
};

const snapshot: ProposalDecisionSnapshot = {
  id: "ap_1",
  requiredActionId: "ra_1",
  pauseGroupId: "pg_1",
  channelId: "ch_1",
  runId: "run_1",
  runStepId: "step_1",
  agentTurnId: "turn_1",
  coworkerId: "cw_1",
  coworkerHandle: "research",
  coworkerName: "Research",
  logicalThreadId: "thread_1",
  toolCallId: "tc_1",
  toolName: "GITHUB_ADD_LABELS_TO_AN_ISSUE",
  observedDescriptorHash: HASH,
  approvalPolicyHash: HASH,
  connectorBindingId: "cb_1",
  accountId: "acct_1",
  actingIdentity: acting,
  redactedArguments: { labels: ["forgeroom-p0-probe"] },
  argumentsHash: HASH,
  redactedTarget: { display: "pramodthe/ForgeRoom#35" },
  targetHash: HASH,
  artifactRevisionHash: null,
  expectedEffect: "Add labels",
  riskClass: "medium",
  payloadHash: HASH,
  sessionGeneration: 1,
  sessionGenerationId: "gen_1",
  liveApprovalPolicyHash: HASH,
  liveSessionGeneration: 1,
  state: "proposed",
  expiresAt: EXPIRES,
  providerIdempotencyKey: null,
};

describe("approval decision gate", () => {
  it("builds a card with lineage, bindings, redacted args, effect, hash and expiry", () => {
    const card = buildApprovalCard(snapshot);
    expect(card.proposal_id).toBe("ap_1");
    expect(card.coworker_handle).toBe("research");
    expect(card.tool_name).toBe("GITHUB_ADD_LABELS_TO_AN_ISSUE");
    expect(card.observed_descriptor_hash).toBe(HASH);
    expect(card.arguments_hash).toBe(HASH);
    expect(card.payload_hash).toBe(HASH);
    expect(card.expires_at).toBe(EXPIRES);
    expect(card.redacted_arguments).toEqual({ labels: ["forgeroom-p0-probe"] });
    expect(hashActingIdentity(acting).startsWith("sha256:")).toBe(true);
  });

  it("accepts matching bindings and rejects expiry or changed fields as stale/expired", () => {
    expect(
      evaluateApprovalDecisionGate({
        snapshot,
        command: {
          decision: "allow",
          expected_arguments_hash: HASH,
          expected_descriptor_hash: HASH,
          expected_session_generation: 1,
        },
        nowIso: NOW,
      }),
    ).toEqual({ ok: true });

    expect(
      evaluateApprovalDecisionGate({
        snapshot: { ...snapshot, expiresAt: "2026-08-25T22:00:00.000Z" },
        command: {
          decision: "deny",
          expected_arguments_hash: HASH,
          expected_descriptor_hash: HASH,
          expected_session_generation: 1,
        },
        nowIso: NOW,
      }),
    ).toEqual({ ok: false, reason: "expired_proposal", markState: "expired" });

    expect(
      evaluateApprovalDecisionGate({
        snapshot,
        command: {
          decision: "allow",
          expected_arguments_hash: `sha256:${"cd".repeat(32)}`,
          expected_descriptor_hash: HASH,
          expected_session_generation: 1,
        },
        nowIso: NOW,
      }),
    ).toEqual({ ok: false, reason: "stale_proposal", markState: "stale" });

    expect(
      evaluateApprovalDecisionGate({
        snapshot: { ...snapshot, liveSessionGeneration: 2 },
        command: {
          decision: "allow",
          expected_arguments_hash: HASH,
          expected_descriptor_hash: HASH,
          expected_session_generation: 1,
        },
        nowIso: NOW,
      }),
    ).toEqual({ ok: false, reason: "stale_proposal", markState: "stale" });
  });
});
