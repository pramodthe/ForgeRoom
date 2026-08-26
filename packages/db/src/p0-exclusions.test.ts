import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MIGRATIONS_DIR, listForwardMigrations } from "./migrate";

const FORBIDDEN_COLUMN = new RegExp(
  String.raw`^\s+(iframe_v1|source_kind|source_blob_key|source_hash|csp_value|csp_hash|bootstrap_version|bootstrap_hash|sanitizer_policy_version|sanitizer_policy_hash|permissions_policy|delivery_body|delivery_headers|delivery_security_epoch|verifier_profile|request_agent_turn|open_existing_hitl|confirmation_challenge_hash|confirmation_summary|confirmed_by|confirmed_at|prepared_auth_session_id|requires_trusted_confirmation|target_coworker_id|intent_template_hash|historical_replay_blocked|generated_origin|context_classification_high_watermark|iframe_context_eligible|agui_source_ref_json|default_coordinator_agent_id|parent_run_step_id)\b`,
  "m",
);

describe("P0 migration files", () => {
  it("do not declare generated-document or trusted-confirmation columns", () => {
    for (const file of listForwardMigrations()) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      expect(sql, file).not.toMatch(FORBIDDEN_COLUMN);
      expect(sql, file).not.toMatch(/\bawaiting_confirmation\b/);
      expect(sql, file).not.toMatch(/\bgenerate_open_ui\b/);
    }
  });
});
