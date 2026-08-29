import { describe, expect, it } from "vitest";
import { recordApprovalDecision } from "./approval-decision";
import { derivePausePayloadKey } from "./pause-crypto";
import { persistPauseGroupCapture, type PersistPauseGroupAction } from "./pause-group";
import {
  claimPauseGroupResume,
  expirePauseResumeCiphertexts,
  loadPauseGroupResumeGate,
  loadPauseResumeForCreate,
  recordQuestionAnswer,
} from "./pause-resume";
import { HASH, NOW, seedRuntime, withMigratedDatabase } from "./test-harness";

const KEY = derivePausePayloadKey("test-pause-secret");
const ACTING = {
  service: "github",
  account_display: "fixture-org",
  principal_type: "bot" as const,
  principal_display: "fixture-bot",
  principal_id_hash: HASH,
};
const ARG_HASH = `sha256:${"11".repeat(32)}`;
const TARGET_HASH = `sha256:${"22".repeat(32)}`;
const PAYLOAD_HASH = `sha256:${"33".repeat(32)}`;
const PROMPT_HASH = `sha256:${"44".repeat(32)}`;

const mixedActions: PersistPauseGroupAction[] = [
  {
    actionType: "approval",
    providerActionId: "prov_approval",
    payloadRedacted: {
      type: "approval",
      toolName: "GITHUB_ADD_LABELS_TO_AN_ISSUE",
      toolCallId: "tc_write",
      threadId: "thread_1",
      target: { display: "pramodthe/ForgeRoom#35" },
      arguments: { labels: ["forgeroom-p0-probe"] },
      expectedEffect: "Add labels to issue",
      riskClass: "medium",
    },
    payloadHash: PAYLOAD_HASH,
    proposal: {
      toolCallId: "tc_write",
      toolName: "GITHUB_ADD_LABELS_TO_AN_ISSUE",
      observedDescriptorHash: HASH,
      riskClass: "medium",
      expectedEffect: "Add labels to issue",
      normalizedArgumentsRedacted: {
        owner: "pramodthe",
        repo: "ForgeRoom",
        issue_number: 35,
        labels: ["forgeroom-p0-probe"],
      },
      argumentsHash: ARG_HASH,
      targetRedacted: {
        kind: "github_issue",
        display: "pramodthe/ForgeRoom#35",
      },
      targetHash: TARGET_HASH,
      artifactRevisionHash: null,
      providerIdempotencyKey: null,
    },
  },
  {
    actionType: "question",
    providerActionId: "prov_question",
    payloadRedacted: {
      type: "question",
      prompt: { prompt: "Confirm the label?" },
      toolCallId: "tc_q",
      threadId: "thread_1",
    },
    payloadHash: PROMPT_HASH,
    promptRedacted: { prompt: "Confirm the label?" },
    promptHash: PROMPT_HASH,
  },
];

async function preparePausedTurn(sql: Parameters<typeof seedRuntime>[0]) {
  await sql`UPDATE agent_turns SET state = 'completed', completed_at = ${NOW} WHERE id = 'turn_1'`;
  await sql`
    UPDATE turn_queue_items
    SET state = 'completed', completed_at = ${NOW}, lease_owner = NULL, lease_expires_at = NULL
    WHERE id = 'q_1'
  `;
  await sql`
    INSERT INTO turn_queue_items (
      id, channel_agent_session_id, run_step_id, bound_session_generation_id, input_type,
      input_payload_redacted_json, fifo_sequence, state, created_at
    )
    VALUES ('q_pg', 'cas_1', 'step_1', 'gen_1', 'normal', '{}'::jsonb, 10, 'claimed', ${NOW})
  `;
  await sql`
    INSERT INTO agent_turns (
      id, run_step_id, channel_agent_session_id, session_generation_id, queue_item_id,
      application_run_token, agui_run_id, input_type, state, trueforge_turn_id, started_at
    )
    VALUES (
      'turn_pg', 'step_1', 'cas_1', 'gen_1', 'q_pg',
      'art_pg', 'agui_pg', 'normal', 'streaming', 'tf_turn_pg', ${NOW}
    )
  `;
}

async function resolveMixedGroup(
  sql: Parameters<typeof seedRuntime>[0],
  capture: { pauseGroupId: string; actionProposalIds: string[]; questionIds: string[] },
) {
  const decision = await recordApprovalDecision(sql, {
    proposalId: capture.actionProposalIds[0]!,
    workspaceId: "ws_1",
    actorUserId: "user_1",
    encryptionKey: KEY,
    command: {
      decision: "allow",
      expected_arguments_hash: ARG_HASH,
      expected_descriptor_hash: HASH,
      expected_session_generation: 1,
    },
    now: NOW,
  });
  expect(decision.ok).toBe(true);
  if (!decision.ok) throw new Error("decision");
  expect(decision.pauseGroupReady).toBe(false);

  const answer = await recordQuestionAnswer(sql, {
    questionId: capture.questionIds[0]!,
    workspaceId: "ws_1",
    actorUserId: "user_1",
    expectedPromptHash: PROMPT_HASH,
    answer: "Confirmed",
    encryptionKey: KEY,
    now: NOW,
  });
  expect(answer.ok).toBe(true);
  if (!answer.ok) throw new Error("answer");
  expect(answer.pauseGroupReady).toBe(true);
  return answer.pauseGroupId;
}

describe("atomic PauseResume", () => {
  it("refuses resume until every mixed action resolves, then CAS-creates one PauseResume", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await preparePausedTurn(sql);
      const capture = await persistPauseGroupCapture(sql, {
        agentTurnId: "turn_pg",
        trueforgeTurnId: "tf_turn_pg",
        generation: 1,
        actions: mixedActions,
        runStepState: "awaiting_approval",
        connectorBindingId: "cb_1",
        actingIdentityJson: ACTING,
        approvalPolicyHash: HASH,
        now: NOW,
      });
      expect(capture.ok).toBe(true);
      if (!capture.ok) throw new Error("capture");

      const early = await claimPauseGroupResume(sql, {
        pauseGroupId: capture.pauseGroupId,
        workspaceId: "ws_1",
        workerId: "worker_1",
        encryptionKey: KEY,
        applicationRunToken: "art_resume_1",
        now: NOW,
      });
      expect(early).toMatchObject({ ok: false, reason: "incomplete" });

      const pauseGroupId = await resolveMixedGroup(sql, capture);

      const responseProjections = await sql<Array<{ response_redacted_json: unknown }>>`
        SELECT response_redacted_json
        FROM required_actions
        WHERE pause_group_id = ${pauseGroupId}
      `;
      expect(JSON.stringify(responseProjections)).not.toContain("Confirmed");

      const first = await claimPauseGroupResume(sql, {
        pauseGroupId,
        workspaceId: "ws_1",
        workerId: "worker_1",
        encryptionKey: KEY,
        applicationRunToken: "art_resume_1",
        now: NOW,
      });
      if (!first.ok) {
        throw new Error(`claim failed: ${JSON.stringify(first)}`);
      }
      expect(first.inserted).toBe(true);
      expect(first).toMatchObject({
        channelId: "ch_1",
        channelAgentSessionId: "cas_1",
        coworkerId: "cw_1",
        logicalThreadId: "thread_1",
      });

      const loaded = await loadPauseResumeForCreate(sql, {
        pauseResumeId: first.pauseResumeId,
        encryptionKey: KEY,
      });
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) throw new Error("load");
      expect(loaded.plaintext.responses).toHaveLength(2);
      expect(JSON.stringify(loaded.plaintext.responses)).toContain("Confirmed");
      expect(
        loaded.plaintext.responses.every((r) => r.kind === "approval" || r.kind === "question"),
      ).toBe(true);

      const second = await claimPauseGroupResume(sql, {
        pauseGroupId,
        workspaceId: "ws_1",
        workerId: "worker_2",
        encryptionKey: KEY,
        applicationRunToken: "art_resume_2",
        now: NOW,
      });
      expect(second).toMatchObject({
        ok: false,
        reason: "already_resuming",
        existingPauseResumeId: first.pauseResumeId,
      });

      const resumes = await sql<{ id: string }[]>`
        SELECT id FROM pause_resumes WHERE pause_group_id = ${pauseGroupId}
      `;
      expect(resumes).toHaveLength(1);

      const group = await sql<{ state: string; resume_claim_token: string | null }[]>`
        SELECT state, resume_claim_token FROM pause_groups WHERE id = ${pauseGroupId}
      `;
      expect(group[0]?.state).toBe("resuming");
      expect(group[0]?.resume_claim_token).toBeTruthy();
    });
  }, 60_000);

  it("exposes interrupt ids for PauseGroup AG-UI resume authorization", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await preparePausedTurn(sql);
      const capture = await persistPauseGroupCapture(sql, {
        agentTurnId: "turn_pg",
        trueforgeTurnId: "tf_turn_pg",
        generation: 1,
        actions: mixedActions,
        runStepState: "awaiting_approval",
        connectorBindingId: "cb_1",
        actingIdentityJson: ACTING,
        approvalPolicyHash: HASH,
        now: NOW,
      });
      if (!capture.ok) throw new Error("capture");
      const pauseGroupId = await resolveMixedGroup(sql, capture);
      const gate = await loadPauseGroupResumeGate(sql, {
        pauseGroupId,
        workspaceId: "ws_1",
      });
      expect(gate.ok).toBe(true);
      if (!gate.ok) throw new Error("gate");
      expect(gate.state).toBe("ready");
      expect(gate).toMatchObject({
        channelId: "ch_1",
        channelAgentSessionId: "cas_1",
        coworkerId: "cw_1",
        logicalThreadId: "thread_1",
      });
      expect(gate.requiredActionIds).toHaveLength(2);
      expect(gate.actions).toEqual([
        {
          requiredActionId: gate.requiredActionIds[0],
          providerActionId: "prov_approval",
        },
        {
          requiredActionId: gate.requiredActionIds[1],
          providerActionId: "prov_question",
        },
      ]);
      expect(gate.providerActionIds).toEqual(
        expect.arrayContaining(["prov_approval", "prov_question"]),
      );
      expect(gate.interruptIds).toEqual(
        expect.arrayContaining([...gate.requiredActionIds, ...gate.providerActionIds]),
      );
    });
  }, 60_000);

  it("expires ciphertext after the recovery window", async () => {
    await withMigratedDatabase(async (sql) => {
      await seedRuntime(sql);
      await preparePausedTurn(sql);
      const capture = await persistPauseGroupCapture(sql, {
        agentTurnId: "turn_pg",
        trueforgeTurnId: "tf_turn_pg",
        generation: 1,
        actions: mixedActions,
        runStepState: "awaiting_approval",
        connectorBindingId: "cb_1",
        actingIdentityJson: ACTING,
        approvalPolicyHash: HASH,
        now: NOW,
      });
      if (!capture.ok) throw new Error("capture");
      const pauseGroupId = await resolveMixedGroup(sql, capture);
      const claim = await claimPauseGroupResume(sql, {
        pauseGroupId,
        workspaceId: "ws_1",
        workerId: "worker_1",
        encryptionKey: KEY,
        applicationRunToken: "art_resume_exp",
        now: NOW,
      });
      if (!claim.ok) throw new Error("claim");

      await sql`
        UPDATE pause_resumes
        SET state = 'completed', trueforge_resume_turn_id = 'tf_resume_1', completed_at = ${NOW}
        WHERE id = ${claim.pauseResumeId}
      `;
      await sql`
        UPDATE pause_groups
        SET state = 'resumed', resumed_at = ${NOW}
        WHERE id = ${pauseGroupId}
      `;

      const tooSoon = await expirePauseResumeCiphertexts(sql, {
        now: "2026-08-25T23:30:00.000Z",
        recoveryWindowMs: 24 * 60 * 60 * 1000,
      });
      expect(tooSoon.expiredResumeCount).toBe(0);

      const expired = await expirePauseResumeCiphertexts(sql, {
        now: "2026-08-27T00:00:00.000Z",
        recoveryWindowMs: 24 * 60 * 60 * 1000,
      });
      expect(expired.expiredResumeCount).toBe(1);
      expect(expired.expiredActionCount).toBeGreaterThan(0);

      const row = await sql<{ response_payload_ciphertext: string }[]>`
        SELECT response_payload_ciphertext FROM pause_resumes WHERE id = ${claim.pauseResumeId}
      `;
      expect(row[0]?.response_payload_ciphertext).toBe("enc:v1:expired");
    });
  }, 60_000);
});
