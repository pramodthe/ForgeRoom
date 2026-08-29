import { describe, expect, it } from "vitest";
import { sessionResponseSchema } from "@forgeroom/contracts";
import {
  derivePausePayloadKey,
  persistPauseGroupCapture,
  recordApprovalDecision,
  type PersistPauseGroupApprovalAction,
} from "@forgeroom/db";
import { HASH, NOW, seedRuntime, withMigratedDatabase } from "@forgeroom/db/test-harness";
import { loadApiEnv } from "../env";
import { createApiApp } from "../server";
import { createAuthService } from "../auth/service";
import { createPostgresAuthStore } from "../auth/postgres-store";
import { createPostgresWorkspaceStore } from "../workspace/postgres-store";
import { createWorkspaceService } from "../workspace/service";
import { createApprovalService } from "./service";

const PASSWORD = "correct-horse-battery";
const ARG_HASH = `sha256:${"11".repeat(32)}`;
const TARGET_HASH = `sha256:${"22".repeat(32)}`;
const PAYLOAD_HASH = `sha256:${"33".repeat(32)}`;
const EXPIRES = "2099-01-01T00:00:00.000Z";

const ACTING = {
  service: "github",
  account_display: "fixture-org",
  principal_type: "bot" as const,
  principal_display: "fixture-bot",
  principal_id_hash: HASH,
};

const approvalAction: PersistPauseGroupApprovalAction = {
  actionType: "approval",
  providerActionId: "prov_approval",
  payloadRedacted: {
    type: "approval",
    toolName: "GITHUB_ADD_LABELS_TO_AN_ISSUE",
    toolCallId: "tc_write",
    target: { display: "pramodthe/ForgeRoom#35" },
    arguments: { labels: ["forgeroom-p0-probe"] },
    expectedEffect: "Add labels",
    riskClass: "medium",
  },
  payloadHash: PAYLOAD_HASH,
  proposal: {
    toolCallId: "tc_write",
    toolName: "GITHUB_ADD_LABELS_TO_AN_ISSUE",
    observedDescriptorHash: HASH,
    riskClass: "medium",
    expectedEffect: "Add labels",
    normalizedArgumentsRedacted: { labels: ["forgeroom-p0-probe"] },
    argumentsHash: ARG_HASH,
    targetRedacted: { display: "pramodthe/ForgeRoom#35" },
    targetHash: TARGET_HASH,
    artifactRevisionHash: null,
    providerIdempotencyKey: null,
  },
};

function cookieFrom(response: Response, name: string): string | undefined {
  const header = response.headers.get("set-cookie");
  if (!header) return undefined;
  const match = header.match(new RegExp(`${name}=([^;]+)`));
  return match?.[1];
}

function mutationHeaders(
  env: ReturnType<typeof loadApiEnv>,
  cookie: string,
  csrf: string,
): Record<string, string> {
  return {
    "content-type": "application/json",
    cookie: `${env.sessionCookieName}=${cookie}`,
    origin: env.appOrigin,
    "x-csrf-token": csrf,
  };
}

async function login(app: ReturnType<typeof createApiApp>, env: ReturnType<typeof loadApiEnv>) {
  const response = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "owner@example.test", password: PASSWORD }),
  });
  expect(response.status).toBe(200);
  const session = sessionResponseSchema.parse(await response.json());
  const cookie = cookieFrom(response, env.sessionCookieName);
  expect(cookie).toBeTruthy();
  return { session, cookie: cookie! };
}

async function preparePausedTurn(
  sql: Parameters<typeof seedRuntime>[0],
  input: {
    turnId: string;
    queueId: string;
    trueforgeTurnId: string;
    providerActionId: string;
    toolCallId: string;
    fifo: number;
    expiresAt?: string;
  },
) {
  await sql`
    INSERT INTO turn_queue_items (
      id, channel_agent_session_id, run_step_id, bound_session_generation_id, input_type,
      input_payload_redacted_json, fifo_sequence, state, created_at
    )
    VALUES (
      ${input.queueId}, 'cas_1', 'step_1', 'gen_1', 'normal', '{}'::jsonb,
      ${input.fifo}, 'claimed', ${NOW}
    )
  `;
  await sql`
    INSERT INTO agent_turns (
      id, run_step_id, channel_agent_session_id, session_generation_id, queue_item_id,
      application_run_token, agui_run_id, input_type, state, trueforge_turn_id, started_at
    )
    VALUES (
      ${input.turnId}, 'step_1', 'cas_1', 'gen_1', ${input.queueId},
      ${`art_${input.turnId}`}, ${`agui_${input.turnId}`}, 'normal', 'streaming',
      ${input.trueforgeTurnId}, ${NOW}
    )
  `;
  const persisted = await persistPauseGroupCapture(sql, {
    agentTurnId: input.turnId,
    trueforgeTurnId: input.trueforgeTurnId,
    generation: 1,
    actions: [
      {
        actionType: "approval" as const,
        providerActionId: input.providerActionId,
        payloadRedacted: approvalAction.payloadRedacted,
        payloadHash: approvalAction.payloadHash,
        proposal: {
          ...approvalAction.proposal,
          toolCallId: input.toolCallId,
        },
      },
    ],
    runStepState: "awaiting_approval",
    connectorBindingId: "cb_1",
    actingIdentityJson: ACTING,
    approvalPolicyHash: HASH,
    expiresAt: input.expiresAt ?? EXPIRES,
    now: NOW,
  });
  expect(persisted.ok).toBe(true);
  if (!persisted.ok) throw new Error("persist");
  return persisted;
}

async function bootstrapAuthAndRuntime(sql: Parameters<typeof seedRuntime>[0]) {
  const env = loadApiEnv({
    NODE_ENV: "test",
    APP_ORIGIN: "http://localhost:5173",
    OWNER_EMAIL: "owner@example.test",
    OWNER_PASSWORD: PASSWORD,
    OWNER_USER_ID: "user_1",
    OWNER_DISPLAY_NAME: "Owner",
    WORKSPACE_ID: "ws_1",
    AUTH_STORE: "postgres",
    PAUSE_PAYLOAD_ENCRYPTION_SECRET: "test-pause-secret",
  });
  await seedRuntime(sql);
  await sql`UPDATE agent_turns SET state = 'completed', completed_at = ${NOW} WHERE id = 'turn_1'`;
  await sql`
    UPDATE turn_queue_items
    SET state = 'completed', completed_at = ${NOW}, lease_owner = NULL, lease_expires_at = NULL
    WHERE id = 'q_1'
  `;
  const auth = createAuthService({ env, store: createPostgresAuthStore(sql) });
  await auth.seedOwner();
  return { env, auth };
}

describe("secure approval decision API", () => {
  it("returns the approval card and records allow with auth/CSRF/replay/provider-count checks", async () => {
    await withMigratedDatabase(async (sql) => {
      const { env, auth } = await bootstrapAuthAndRuntime(sql);
      const persisted = await preparePausedTurn(sql, {
        turnId: "turn_pg",
        queueId: "q_pg",
        trueforgeTurnId: "tf_turn_pg",
        providerActionId: "prov_approval",
        toolCallId: "tc_write",
        fifo: 10,
      });

      const workspace = createWorkspaceService({
        store: createPostgresWorkspaceStore(sql),
        sql,
      });
      const approvals = createApprovalService({ env, sql });
      let providerCalls = 0;
      const trueforgeClient = {
        cancelSession: async () => {
          providerCalls += 1;
          return { ok: true };
        },
      } as never;
      const app = createApiApp({
        env,
        auth,
        workspace,
        approvals,
        sql,
        trueforgeClient,
      });
      const { session, cookie } = await login(app, env);
      const proposalId = persisted.actionProposalIds[0]!;

      const cardRes = await app.request(`/api/approvals/${proposalId}`, {
        headers: { cookie: `${env.sessionCookieName}=${cookie}` },
      });
      expect(cardRes.status).toBe(200);
      const cardBody = (await cardRes.json()) as {
        card: {
          tool_name: string;
          arguments_hash: string;
          payload_hash: string;
          expires_at: string;
          coworker_handle: string;
          observed_descriptor_hash: string;
          expected_effect: string;
        };
      };
      expect(cardBody.card.tool_name).toBe("GITHUB_ADD_LABELS_TO_AN_ISSUE");
      expect(cardBody.card.arguments_hash).toBe(ARG_HASH);
      expect(cardBody.card.payload_hash).toBe(PAYLOAD_HASH);
      expect(cardBody.card.observed_descriptor_hash).toBe(HASH);
      expect(cardBody.card.expected_effect).toBe("Add labels");
      expect(cardBody.card.coworker_handle).toBe("research");

      const pendingRes = await app.request("/api/channels/ch_1/pending-approvals", {
        headers: { cookie: `${env.sessionCookieName}=${cookie}` },
      });
      expect(pendingRes.status).toBe(200);
      const pendingBody = (await pendingRes.json()) as { proposal_ids: string[] };
      expect(pendingBody.proposal_ids).toContain(proposalId);

      const unauth = await app.request(`/api/approvals/${proposalId}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: env.appOrigin },
        body: JSON.stringify({
          decision: "allow",
          expected_arguments_hash: ARG_HASH,
          expected_descriptor_hash: HASH,
          expected_session_generation: 1,
        }),
      });
      expect(unauth.status).toBe(401);

      const noCsrf = await app.request(`/api/approvals/${proposalId}/decision`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${env.sessionCookieName}=${cookie}`,
          origin: env.appOrigin,
        },
        body: JSON.stringify({
          decision: "allow",
          expected_arguments_hash: ARG_HASH,
          expected_descriptor_hash: HASH,
          expected_session_generation: 1,
        }),
      });
      expect(noCsrf.status).toBe(403);

      const forgedOrigin = await app.request(`/api/approvals/${proposalId}/decision`, {
        method: "POST",
        headers: {
          ...mutationHeaders(env, cookie, session.csrf_token),
          origin: "https://evil.example",
        },
        body: JSON.stringify({
          decision: "allow",
          expected_arguments_hash: ARG_HASH,
          expected_descriptor_hash: HASH,
          expected_session_generation: 1,
        }),
      });
      expect(forgedOrigin.status).toBe(403);

      const allow = await app.request(`/api/approvals/${proposalId}/decision`, {
        method: "POST",
        headers: mutationHeaders(env, cookie, session.csrf_token),
        body: JSON.stringify({
          decision: "allow",
          expected_arguments_hash: ARG_HASH,
          expected_descriptor_hash: HASH,
          expected_session_generation: 1,
          reason: "Reviewed exact target",
        }),
      });
      expect(allow.status).toBe(200);
      const allowed = (await allow.json()) as {
        proposal_state: string;
        pause_group_ready: boolean;
        provider_calls: number;
      };
      expect(allowed.proposal_state).toBe("allowed");
      expect(allowed.pause_group_ready).toBe(true);
      expect(allowed.provider_calls).toBe(0);
      expect(providerCalls).toBe(0);

      const replay = await app.request(`/api/approvals/${proposalId}/decision`, {
        method: "POST",
        headers: mutationHeaders(env, cookie, session.csrf_token),
        body: JSON.stringify({
          decision: "deny",
          expected_arguments_hash: ARG_HASH,
          expected_descriptor_hash: HASH,
          expected_session_generation: 1,
        }),
      });
      expect(replay.status).toBe(409);
      const replayBody = (await replay.json()) as { error: { code: string } };
      expect(replayBody.error.code).toBe("decision_already_recorded");

      const events = await sql<{ action: string }[]>`
        SELECT action FROM audit_events
        WHERE target_id = ${proposalId} AND action = 'approval.decided'
      `;
      expect(events).toHaveLength(1);
    });
  }, 60_000);

  it("marks stale/expired, concurrent one-winner, denial event, and request_changes correction draft", async () => {
    await withMigratedDatabase(async (sql) => {
      const { env } = await bootstrapAuthAndRuntime(sql);
      const key = derivePausePayloadKey(env.pausePayloadEncryptionSecret);

      const stalePersist = await preparePausedTurn(sql, {
        turnId: "turn_stale",
        queueId: "q_stale",
        trueforgeTurnId: "tf_stale",
        providerActionId: "prov_stale",
        toolCallId: "tc_stale",
        fifo: 10,
      });
      const stale = await recordApprovalDecision(sql, {
        proposalId: stalePersist.actionProposalIds[0]!,
        workspaceId: "ws_1",
        actorUserId: env.ownerUserId,
        encryptionKey: key,
        now: NOW,
        command: {
          decision: "allow",
          expected_arguments_hash: `sha256:${"ff".repeat(32)}`,
          expected_descriptor_hash: HASH,
          expected_session_generation: 1,
        },
      });
      expect(stale).toMatchObject({ ok: false, reason: "stale_proposal" });
      const staleState = await sql<{ state: string }[]>`
        SELECT state FROM action_proposals WHERE id = ${stalePersist.actionProposalIds[0]!}
      `;
      expect(staleState[0]?.state).toBe("stale");

      const expiredPersist = await preparePausedTurn(sql, {
        turnId: "turn_expired",
        queueId: "q_expired",
        trueforgeTurnId: "tf_expired",
        providerActionId: "prov_expired",
        toolCallId: "tc_expired",
        fifo: 11,
        expiresAt: "2026-08-25T22:00:00.000Z",
      });
      const expired = await recordApprovalDecision(sql, {
        proposalId: expiredPersist.actionProposalIds[0]!,
        workspaceId: "ws_1",
        actorUserId: env.ownerUserId,
        encryptionKey: key,
        now: NOW,
        command: {
          decision: "deny",
          expected_arguments_hash: ARG_HASH,
          expected_descriptor_hash: HASH,
          expected_session_generation: 1,
        },
      });
      expect(expired).toMatchObject({ ok: false, reason: "expired_proposal" });

      const concurrentPersist = await preparePausedTurn(sql, {
        turnId: "turn_conc",
        queueId: "q_conc",
        trueforgeTurnId: "tf_conc",
        providerActionId: "prov_conc",
        toolCallId: "tc_conc",
        fifo: 12,
      });
      const proposalId = concurrentPersist.actionProposalIds[0]!;
      const [a, b] = await Promise.all([
        recordApprovalDecision(sql, {
          proposalId,
          workspaceId: "ws_1",
          actorUserId: env.ownerUserId,
          encryptionKey: key,
          now: NOW,
          command: {
            decision: "allow",
            expected_arguments_hash: ARG_HASH,
            expected_descriptor_hash: HASH,
            expected_session_generation: 1,
          },
        }),
        recordApprovalDecision(sql, {
          proposalId,
          workspaceId: "ws_1",
          actorUserId: env.ownerUserId,
          encryptionKey: key,
          now: NOW,
          command: {
            decision: "deny",
            expected_arguments_hash: ARG_HASH,
            expected_descriptor_hash: HASH,
            expected_session_generation: 1,
            reason: "No",
          },
        }),
      ]);
      expect([a, b].filter((r) => r.ok)).toHaveLength(1);
      expect([a, b].filter((r) => !r.ok)[0]).toMatchObject({
        ok: false,
        reason: "decision_already_recorded",
      });

      const denyPersist = await preparePausedTurn(sql, {
        turnId: "turn_deny",
        queueId: "q_deny",
        trueforgeTurnId: "tf_deny",
        providerActionId: "prov_deny",
        toolCallId: "tc_deny",
        fifo: 13,
      });
      const denied = await recordApprovalDecision(sql, {
        proposalId: denyPersist.actionProposalIds[0]!,
        workspaceId: "ws_1",
        actorUserId: env.ownerUserId,
        encryptionKey: key,
        now: NOW,
        command: {
          decision: "deny",
          expected_arguments_hash: ARG_HASH,
          expected_descriptor_hash: HASH,
          expected_session_generation: 1,
          reason: "Unsafe",
        },
      });
      expect(denied.ok).toBe(true);
      if (!denied.ok) throw new Error("deny");
      expect(denied.providerCalls).toBe(0);
      expect(denied.correctionDraft).toBeNull();
      const denyEvents = await sql<{ normalized_type: string }[]>`
        SELECT normalized_type FROM run_events
        WHERE agent_turn_id = 'turn_deny' AND normalized_type = 'approval.decided'
      `;
      expect(denyEvents).toHaveLength(1);

      const changesPersist = await preparePausedTurn(sql, {
        turnId: "turn_chg",
        queueId: "q_chg",
        trueforgeTurnId: "tf_chg",
        providerActionId: "prov_chg",
        toolCallId: "tc_chg",
        fifo: 14,
      });
      const changes = await recordApprovalDecision(sql, {
        proposalId: changesPersist.actionProposalIds[0]!,
        workspaceId: "ws_1",
        actorUserId: env.ownerUserId,
        encryptionKey: key,
        now: NOW,
        command: {
          decision: "request_changes",
          expected_arguments_hash: ARG_HASH,
          expected_descriptor_hash: HASH,
          expected_session_generation: 1,
          reason: "Use a safer label set",
        },
      });
      expect(changes.ok).toBe(true);
      if (!changes.ok) throw new Error("request_changes");
      expect(changes.proposalState).toBe("denied");
      expect(changes.pauseGroupReady).toBe(false);
      expect(changes.correctionDraft?.content).toBe("[REDACTED]");
      expect(changes.providerCalls).toBe(0);
      const correction = await sql<{ input_type: string }[]>`
        SELECT input_type FROM turn_queue_items WHERE id = ${changes.correctionDraft!.queueItemId}
      `;
      expect(correction[0]?.input_type).toBe("correction");
    });
  }, 90_000);
});
