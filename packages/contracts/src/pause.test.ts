import { describe, expect, it } from "vitest";
import {
  actionProposalSchema,
  approvalDecisionCommandSchema,
  pauseGroupSchema,
  pauseResumeSchema,
  questionAnswerCommandSchema,
  questionSchema,
  requiredActionSchema,
} from "./pause";
import { HASH, NOW } from "./test-helpers";

const READY_AT = "2026-08-25T23:01:00.000Z";
const RESUMED_AT = "2026-08-25T23:02:00.000Z";
const EXPIRES_AT = "2026-08-26T00:00:00.000Z";

const proposalFixture = {
  schemaVersion: 1,
  id: "proposal_1",
  required_action_id: "required_action_1",
  channel_id: "channel_1",
  run_id: "run_1",
  run_step_id: "step_1",
  coworker_id: "coworker_1",
  logical_thread_id: "logical_thread_1",
  agent_turn_id: "turn_1",
  tool_call_id: "tool_call_1",
  session_generation_id: "session_generation_3",
  session_generation: 3,
  approval_policy_hash: HASH,
  connector_binding_id: "connector_1",
  account_id: "fixed_account_1",
  tool_name: "GITHUB_UPDATE_ISSUE",
  observed_descriptor_hash: HASH,
  acting_identity: {
    service: "github",
    account_display: "fixture-org",
    principal_type: "bot",
    principal_display: "fixture-bot",
    principal_id_hash: HASH,
  },
  acting_identity_hash: HASH,
  redacted_arguments: { issue: 42, state: "closed" },
  arguments_hash: HASH,
  redacted_target: { repository: "org/repo", issue: 42 },
  target_hash: HASH,
  artifact_revision_hash: null,
  expected_effect: "Close issue 42",
  risk_class: "high",
  state: "proposed",
  expires_at: EXPIRES_AT,
  provider_idempotency_key: "intent_1",
  decided_by: null,
  decision_reason: null,
  decided_at: null,
  executed_at: null,
  provider_receipt: null,
};

describe("PauseGroup contract", () => {
  it("accepts collecting, ready and single-claim resume lifecycle records", () => {
    const base = {
      schemaVersion: 1,
      id: "pause_1",
      agent_turn_id: "turn_1",
      trueforge_turn_id: "trueforge_turn_1",
      generation: 3,
      required_action_count: 2,
      created_at: NOW,
    };

    expect(
      pauseGroupSchema.parse({
        ...base,
        state: "collecting",
        resolved_action_count: 1,
        resume_claim_token: null,
        ready_at: null,
        resumed_at: null,
      }).state,
    ).toBe("collecting");
    expect(
      pauseGroupSchema.parse({
        ...base,
        state: "ready",
        resolved_action_count: 2,
        resume_claim_token: null,
        ready_at: READY_AT,
        resumed_at: null,
      }).state,
    ).toBe("ready");
    expect(
      pauseGroupSchema.parse({
        ...base,
        state: "resumed",
        resolved_action_count: 2,
        resume_claim_token: "resume_claim_1",
        ready_at: READY_AT,
        resumed_at: RESUMED_AT,
      }).state,
    ).toBe("resumed");
  });

  it("rejects impossible counts, readiness and claim combinations", () => {
    const base = {
      schemaVersion: 1,
      id: "pause_1",
      agent_turn_id: "turn_1",
      trueforge_turn_id: "trueforge_turn_1",
      generation: 3,
      state: "ready",
      required_action_count: 2,
      resolved_action_count: 2,
      resume_claim_token: null,
      created_at: NOW,
      ready_at: READY_AT,
      resumed_at: null,
    };

    expect(pauseGroupSchema.safeParse({ ...base, resolved_action_count: 3 }).success).toBe(false);
    expect(pauseGroupSchema.safeParse({ ...base, state: "collecting" }).success).toBe(false);
    expect(pauseGroupSchema.safeParse({ ...base, state: "resuming" }).success).toBe(false);
    expect(pauseGroupSchema.safeParse({ ...base, ready_at: null }).success).toBe(false);
    expect(pauseGroupSchema.safeParse({ ...base, required_action_count: 0 }).success).toBe(false);
  });
});

describe("RequiredAction and PauseResume contracts", () => {
  it("separates redacted projections from encrypted response material", () => {
    const pendingAction = {
      schemaVersion: 1,
      id: "required_action_1",
      pause_group_id: "pause_1",
      provider_action_id: "provider_action_1",
      action_type: "approval",
      state: "pending",
      payload_redacted: { target: "issue 42" },
      payload_hash: HASH,
      response_ciphertext: null,
      response_redacted: null,
      resolved_by: null,
      resolved_at: null,
      created_at: NOW,
    };
    expect(requiredActionSchema.parse(pendingAction).state).toBe("pending");
    expect(
      requiredActionSchema.parse({
        ...pendingAction,
        state: "resolved",
        response_ciphertext: "enc:v1:fixture",
        response_redacted: { decision: "allow" },
        resolved_by: "owner_1",
        resolved_at: READY_AT,
      }).state,
    ).toBe("resolved");
    expect(
      requiredActionSchema.safeParse({
        ...pendingAction,
        response_ciphertext: "enc:v1:premature",
      }).success,
    ).toBe(false);
    expect(
      requiredActionSchema.safeParse({
        ...pendingAction,
        state: "resolved",
        resolved_by: "owner_1",
        resolved_at: READY_AT,
      }).success,
    ).toBe(false);
    expect(
      requiredActionSchema.safeParse({ ...pendingAction, response: { decision: "allow" } }).success,
    ).toBe(false);
  });

  it("models one encrypted resume intent and its uncertain reconciliation path", () => {
    const intended = {
      schemaVersion: 1,
      id: "resume_1",
      pause_group_id: "pause_1",
      expected_generation: 3,
      application_run_token: "application_run_1",
      response_payload_hash: HASH,
      response_payload_ciphertext: "enc:v1:resume-fixture",
      state: "intended",
      trueforge_resume_turn_id: null,
      claimed_by: null,
      created_at: READY_AT,
      completed_at: null,
    };

    expect(pauseResumeSchema.parse(intended).state).toBe("intended");
    expect(
      pauseResumeSchema.parse({ ...intended, state: "uncertain", claimed_by: "worker_1" }).state,
    ).toBe("uncertain");
    expect(
      pauseResumeSchema.parse({
        ...intended,
        state: "reconciled",
        claimed_by: "worker_1",
        trueforge_resume_turn_id: "trueforge_resume_turn_1",
        completed_at: RESUMED_AT,
      }).state,
    ).toBe("reconciled");
    expect(pauseResumeSchema.safeParse({ ...intended, claimed_by: "worker_1" }).success).toBe(
      false,
    );
    expect(
      pauseResumeSchema.safeParse({
        ...intended,
        state: "completed",
        claimed_by: "worker_1",
        completed_at: RESUMED_AT,
      }).success,
    ).toBe(false);
    expect(
      pauseResumeSchema.safeParse({ ...intended, response_payload: [{ decision: "allow" }] })
        .success,
    ).toBe(false);
  });
});

describe("approval and question bindings", () => {
  it("binds proposals and approval commands to the same numeric session generation", () => {
    const proposal = actionProposalSchema.parse(proposalFixture);
    const command = approvalDecisionCommandSchema.parse({
      decision: "allow",
      expected_arguments_hash: HASH,
      expected_descriptor_hash: HASH,
      expected_session_generation: 3,
      reason: "Reviewed exact target",
    });

    expect(command.expected_session_generation).toBe(proposal.session_generation);
    expect(
      approvalDecisionCommandSchema.safeParse({
        ...command,
        expected_session_generation: proposal.session_generation_id,
      }).success,
    ).toBe(false);
  });

  it("rejects missing authority bindings and invalid execution metadata", () => {
    const withoutConnector = Object.fromEntries(
      Object.entries(proposalFixture).filter(([key]) => key !== "connector_binding_id"),
    );
    expect(actionProposalSchema.safeParse(withoutConnector).success).toBe(false);
    expect(
      actionProposalSchema.safeParse({ ...proposalFixture, acting_identity: {} }).success,
    ).toBe(false);
    expect(
      actionProposalSchema.safeParse({
        ...proposalFixture,
        state: "proposed",
        decided_by: "owner_1",
      }).success,
    ).toBe(false);
    expect(
      actionProposalSchema.safeParse({
        ...proposalFixture,
        state: "proposed",
        decided_by: "owner_1",
        decided_at: READY_AT,
      }).success,
    ).toBe(false);
    expect(
      actionProposalSchema.safeParse({
        ...proposalFixture,
        state: "succeeded",
        decided_by: "owner_1",
        decided_at: READY_AT,
        executed_at: RESUMED_AT,
      }).success,
    ).toBe(false);

    const allowed = {
      ...proposalFixture,
      state: "allowed",
      decided_by: "owner_1",
      decision_reason: "Reviewed exact authority",
      decided_at: READY_AT,
    };
    expect(actionProposalSchema.safeParse(allowed).success).toBe(true);
    expect(actionProposalSchema.safeParse({ ...allowed, state: "stale" }).success).toBe(true);
    expect(actionProposalSchema.safeParse({ ...allowed, state: "expired" }).success).toBe(true);
    expect(
      actionProposalSchema.safeParse({
        ...allowed,
        state: "stale",
        decided_at: null,
      }).success,
    ).toBe(false);
  });

  it("keeps persisted question answers encrypted and rejects credential-like commands", () => {
    const requested = {
      schemaVersion: 1,
      id: "question_1",
      required_action_id: "required_action_1",
      channel_id: "channel_1",
      run_id: "run_1",
      prompt_hash: HASH,
      prompt_redacted: { prompt: "Choose a safe label" },
      state: "requested",
      answered_by: null,
      answer_ciphertext: null,
      answer_redacted: null,
      answered_at: null,
      expires_at: EXPIRES_AT,
    };
    expect(questionSchema.parse(requested).state).toBe("requested");
    expect(
      questionSchema.parse({
        ...requested,
        state: "answered",
        answered_by: "owner_1",
        answer_ciphertext: "enc:v1:answer-fixture",
        answer_redacted: { choice: "safe-label" },
        answered_at: READY_AT,
      }).state,
    ).toBe("answered");
    expect(questionSchema.safeParse({ ...requested, answer: "raw answer" }).success).toBe(false);
    expect(questionSchema.safeParse({ ...requested, answered_by: "owner_1" }).success).toBe(false);

    expect(
      questionAnswerCommandSchema.parse({
        schemaVersion: 1,
        expected_prompt_hash: HASH,
        answer: "safe-label",
        idempotency_key: "question_answer_1",
      }).answer,
    ).toBe("safe-label");
    expect(
      questionAnswerCommandSchema.safeParse({
        schemaVersion: 1,
        expected_prompt_hash: HASH,
        answer: "api_key=do-not-store",
        idempotency_key: "question_answer_2",
      }).success,
    ).toBe(false);
    expect(
      questionAnswerCommandSchema.safeParse({
        schemaVersion: 1,
        expected_prompt_hash: HASH,
        answer: "safe-label",
        idempotency_key: "question_answer_3",
        response_ciphertext: "browser-must-not-send-this",
      }).success,
    ).toBe(false);
  });
});
