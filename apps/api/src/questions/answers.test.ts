import { describe, expect, it } from "vitest";
import { sessionResponseSchema } from "@forgeroom/contracts";
import {
  derivePausePayloadKey,
  persistPauseGroupCapture,
  recordQuestionAnswer,
  type PersistPauseGroupQuestionAction,
} from "@forgeroom/db";
import { HASH, NOW, seedRuntime, withMigratedDatabase } from "@forgeroom/db/test-harness";
import { loadApiEnv } from "../env";
import { createApiApp } from "../server";
import { createAuthService } from "../auth/service";
import { createPostgresAuthStore } from "../auth/postgres-store";
import { createPostgresWorkspaceStore } from "../workspace/postgres-store";
import { createWorkspaceService } from "../workspace/service";
import { createQuestionService } from "./service";

const PASSWORD = "correct-horse-battery";
const PROMPT_HASH = `sha256:${"44".repeat(32)}`;
const EXPIRES = "2099-01-01T00:00:00.000Z";

const questionAction: PersistPauseGroupQuestionAction = {
  actionType: "question",
  providerActionId: "prov_question",
  payloadRedacted: { type: "question", prompt: { prompt: "Confirm the label?" } },
  payloadHash: PROMPT_HASH,
  promptRedacted: { prompt: "Confirm the label?" },
  promptHash: PROMPT_HASH,
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

async function prepareQuestionTurn(
  sql: Parameters<typeof seedRuntime>[0],
  input: {
    turnId: string;
    queueId: string;
    trueforgeTurnId: string;
    providerActionId: string;
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
        ...questionAction,
        providerActionId: input.providerActionId,
      },
    ],
    runStepState: "awaiting_approval",
    connectorBindingId: "cb_1",
    actingIdentityJson: {
      service: "github",
      account_display: "fixture-org",
      principal_type: "bot",
      principal_display: "fixture-bot",
      principal_id_hash: HASH,
    },
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

describe("secure question answer API", () => {
  it("returns the question card and records an answer with auth/CSRF checks", async () => {
    await withMigratedDatabase(async (sql) => {
      const { env, auth } = await bootstrapAuthAndRuntime(sql);
      const persisted = await prepareQuestionTurn(sql, {
        turnId: "turn_q",
        queueId: "q_q",
        trueforgeTurnId: "tf_turn_q",
        providerActionId: "prov_question",
        fifo: 10,
      });

      const workspace = createWorkspaceService({
        store: createPostgresWorkspaceStore(sql),
        sql,
      });
      const questions = createQuestionService({ env, sql });
      const app = createApiApp({
        env,
        auth,
        workspace,
        questions,
        sql,
      });
      const { session, cookie } = await login(app, env);
      const questionId = persisted.questionIds[0]!;

      const cardRes = await app.request(`/api/questions/${questionId}`, {
        headers: { cookie: `${env.sessionCookieName}=${cookie}` },
      });
      expect(cardRes.status).toBe(200);
      const cardBody = (await cardRes.json()) as {
        card: {
          prompt_hash: string;
          coworker_handle: string;
          pause_group_required_action_count: number;
        };
      };
      expect(cardBody.card.prompt_hash).toBe(PROMPT_HASH);
      expect(cardBody.card.coworker_handle).toBe("research");
      expect(cardBody.card.pause_group_required_action_count).toBe(1);

      const pendingRes = await app.request("/api/channels/ch_1/pending-questions", {
        headers: { cookie: `${env.sessionCookieName}=${cookie}` },
      });
      expect(pendingRes.status).toBe(200);
      const pendingBody = (await pendingRes.json()) as { question_ids: string[] };
      expect(pendingBody.question_ids).toContain(questionId);

      const unauth = await app.request(`/api/questions/${questionId}/answer`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: env.appOrigin },
        body: JSON.stringify({
          schemaVersion: 1,
          expected_prompt_hash: PROMPT_HASH,
          answer: "Yes, confirm.",
          idempotency_key: "idem_1",
        }),
      });
      expect(unauth.status).toBe(401);

      const noCsrf = await app.request(`/api/questions/${questionId}/answer`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${env.sessionCookieName}=${cookie}`,
          origin: env.appOrigin,
        },
        body: JSON.stringify({
          schemaVersion: 1,
          expected_prompt_hash: PROMPT_HASH,
          answer: "Yes, confirm.",
          idempotency_key: "idem_1",
        }),
      });
      expect(noCsrf.status).toBe(403);

      const answer = await app.request(`/api/questions/${questionId}/answer`, {
        method: "POST",
        headers: mutationHeaders(env, cookie, session.csrf_token),
        body: JSON.stringify({
          schemaVersion: 1,
          expected_prompt_hash: PROMPT_HASH,
          answer: "Yes, confirm.",
          idempotency_key: "idem_1",
        }),
      });
      expect(answer.status).toBe(200);
      const answered = (await answer.json()) as {
        question_state: string;
        pause_group_ready: boolean;
      };
      expect(answered.question_state).toBe("answered");
      expect(answered.pause_group_ready).toBe(true);

      const replay = await app.request(`/api/questions/${questionId}/answer`, {
        method: "POST",
        headers: mutationHeaders(env, cookie, session.csrf_token),
        body: JSON.stringify({
          schemaVersion: 1,
          expected_prompt_hash: PROMPT_HASH,
          answer: "Changed mind.",
          idempotency_key: "idem_2",
        }),
      });
      expect(replay.status).toBe(409);
      const replayBody = (await replay.json()) as { error: { code: string } };
      expect(replayBody.error.code).toBe("decision_already_recorded");
    });
  }, 60_000);

  it("rejects credential-like answers and stale prompt hashes", async () => {
    await withMigratedDatabase(async (sql) => {
      const { env, auth } = await bootstrapAuthAndRuntime(sql);
      const persisted = await prepareQuestionTurn(sql, {
        turnId: "turn_stale",
        queueId: "q_stale",
        trueforgeTurnId: "tf_stale",
        providerActionId: "prov_stale",
        fifo: 11,
      });
      const questionId = persisted.questionIds[0]!;

      const workspace = createWorkspaceService({
        store: createPostgresWorkspaceStore(sql),
        sql,
      });
      const questions = createQuestionService({ env, sql });
      const app = createApiApp({ env, auth, workspace, questions, sql });
      const { session, cookie } = await login(app, env);

      const credential = await app.request(`/api/questions/${questionId}/answer`, {
        method: "POST",
        headers: mutationHeaders(env, cookie, session.csrf_token),
        body: JSON.stringify({
          schemaVersion: 1,
          expected_prompt_hash: PROMPT_HASH,
          answer: "password: hunter2",
          idempotency_key: "idem_cred",
        }),
      });
      expect(credential.status).toBe(400);

      const stale = await recordQuestionAnswer(sql, {
        questionId,
        workspaceId: "ws_1",
        actorUserId: env.ownerUserId,
        encryptionKey: derivePausePayloadKey(env.pausePayloadEncryptionSecret),
        now: NOW,
        expectedPromptHash: `sha256:${"ff".repeat(32)}`,
        answer: "Wrong hash",
      });
      expect(stale).toMatchObject({ ok: false, reason: "stale_prompt" });
      const staleState = await sql<{ state: string }[]>`
        SELECT state FROM questions WHERE id = ${questionId}
      `;
      expect(staleState[0]?.state).toBe("stale");
    });
  }, 60_000);
});
