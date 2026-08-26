import { describe, expect, it } from "vitest";
import { errorEnvelopeSchema } from "./errors";
import { loginRequestSchema } from "./identity";
import { isForbiddenPayloadKey, safeJsonObjectSchema, safeJsonValueSchema } from "./primitives";
import { actionProposalSchema } from "./pause";
import { taskRevisionSchema } from "./tasks";
import { HASH, NOW } from "./test-helpers";

describe("safe payload contracts", () => {
  it("rejects known credential and reasoning fields", () => {
    expect(isForbiddenPayloadKey("password")).toBe(true);
    expect(isForbiddenPayloadKey("api_key")).toBe(true);
    expect(isForbiddenPayloadKey("reasoning")).toBe(true);
    expect(isForbiddenPayloadKey("Authorization")).toBe(true);
    expect(safeJsonValueSchema.safeParse({ title: "ok" }).success).toBe(true);
    expect(safeJsonValueSchema.safeParse({ api_key: "secret" }).success).toBe(false);
    expect(safeJsonValueSchema.safeParse({ nested: { reasoning: "hidden chain" } }).success).toBe(
      false,
    );
  });

  it("normalizes provider credential names and rejects them at every depth", () => {
    for (const key of [
      "refresh_token",
      "refresh-token",
      "client_secret",
      "clientSecret",
      "trueforge_api_key",
      "Composio-Api-Key",
      "model_provider_api_key",
      "githubAccessToken",
    ]) {
      expect(isForbiddenPayloadKey(key), key).toBe(true);
    }

    expect(
      safeJsonValueSchema.safeParse({ rows: [{ safe: true }, { nested: { clientSecret: "x" } }] })
        .success,
    ).toBe(false);
  });

  it("rejects normalized credential, private-reasoning, signature, and raw-body variants", () => {
    for (const variants of [
      ["model_reasoning", "modelReasoning", "MODEL-REASONING"],
      ["reasoning_content", "reasoningContent", "REASONING-CONTENT"],
      ["provider_thinking", "providerThinking", "PROVIDER-THINKING"],
      ["database_password", "databasePassword", "DATABASE-PASSWORD"],
      ["github_secret", "githubSecret", "GITHUB-SECRET"],
      ["request_signature", "requestSignature", "REQUEST-SIGNATURE"],
      ["raw_tool_body_fragment", "rawToolBodyFragment", "RAW-TOOL-BODY-FRAGMENT"],
      ["composio_credentials", "composioCredentials", "COMPOSIO-CREDENTIALS"],
      ["provider_authorization", "providerAuthorization", "PROVIDER-AUTHORIZATION"],
      ["chain_of_thought_reasoning", "chainOfThoughtReasoning", "CHAIN-OF-THOUGHT-REASONING"],
      ["signed_request_signature", "signedRequestSignature", "SIGNED-REQUEST-SIGNATURE"],
      ["provider_raw_tool_body", "providerRawToolBody", "PROVIDER-RAW-TOOL-BODY"],
    ]) {
      for (const key of variants) {
        expect(isForbiddenPayloadKey(key), key).toBe(true);
        expect(
          safeJsonValueSchema.safeParse({ envelope: { [key]: "sensitive" } }).success,
          key,
        ).toBe(false);
      }
    }
  });

  it("does not reject unrelated business fields that share generic words", () => {
    const safeBusinessPayload = {
      model_name: "sales-forecast-v2",
      reasoning_category: "customer supplied rationale",
      provider_display_name: "Acme Shipping",
      database_region: "us-west",
      github_repository: "pramodthe/ForgeRoom",
      request_status: "pending",
      customer_signature: "signature record reference",
      raw_tool_body_size: 512,
      secret_santa_owner: "user_1",
      password_reset_required: true,
    };

    for (const key of Object.keys(safeBusinessPayload)) {
      expect(isForbiddenPayloadKey(key), key).toBe(false);
    }
    expect(safeJsonValueSchema.safeParse(safeBusinessPayload).success).toBe(true);
  });

  it("rejects prototype keys before object cloning and non-finite numbers", () => {
    for (const key of ["__proto__", "prototype", "constructor"]) {
      const input = JSON.parse(`{"outer":{"${key}":{"polluted":true}}}`) as unknown;
      expect(safeJsonValueSchema.safeParse(input).success, key).toBe(false);
    }

    expect(safeJsonValueSchema.safeParse(Number.NaN).success).toBe(false);
    expect(safeJsonValueSchema.safeParse(Number.POSITIVE_INFINITY).success).toBe(false);
    expect(safeJsonValueSchema.safeParse(Number.NEGATIVE_INFINITY).success).toBe(false);
    expect(safeJsonValueSchema.safeParse({ finite: 42.5 }).success).toBe(true);
  });

  it("preserves safe-key checks when contracts require an object map", () => {
    expect(safeJsonObjectSchema.safeParse({ refresh_token: "x" }).success).toBe(false);
    expect(
      errorEnvelopeSchema.safeParse({
        error: {
          code: "validation_failed",
          message: "invalid",
          request_id: "req_1",
          retryable: false,
          details: { client_secret: "x" },
        },
      }).success,
    ).toBe(false);
    expect(
      taskRevisionSchema.safeParse({
        schemaVersion: 1,
        id: "trev_1",
        task_id: "task_1",
        revision: 1,
        data: { refresh_token: "x" },
        data_hash: HASH,
        changed_fields: ["refresh_token"],
        actor_type: "human",
        actor_id: "user_1",
        command_id: "cmd_1",
        created_at: NOW,
      }).success,
    ).toBe(false);
  });

  it("allows password only on the login command, not on persisted proposals", () => {
    expect(
      loginRequestSchema.parse({ email: "owner@example.test", password: "local-only" }),
    ).toEqual({
      email: "owner@example.test",
      password: "local-only",
    });
    expect(
      actionProposalSchema.safeParse({
        schemaVersion: 1,
        id: "ap_1",
        required_action_id: "ra_1",
        run_id: "run_1",
        run_step_id: "step_1",
        agent_turn_id: "turn_1",
        tool_call_id: "tc_1",
        session_generation_id: "gen_1",
        tool_name: "WRITE",
        observed_descriptor_hash: HASH,
        arguments_hash: HASH,
        target_hash: HASH,
        redacted_arguments: { password: "nope" },
        expected_effect: "set field",
        risk_class: "high",
        state: "proposed",
        expires_at: NOW,
      }).success,
    ).toBe(false);
  });
});
