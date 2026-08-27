/**
 * Frozen P0 Daytona sandbox contract (ADR-005 / SB-001 / SB-002).
 * Synthetic/public fixture body lives in provider-fixtures/daytona/.
 */
export const P0_SANDBOX_FIXTURE_REMOTE_PATH = "forgeroom-p0-probe-sample.md" as const;

/** SHA-256 of the canonical synthetic demo lines written by the fixture turn. */
export const P0_SANDBOX_FIXTURE_DEMO_LINES_SHA256 =
  "2ac98830ad3b156097e7f86b27dc315a20dcf41b6259cd76b299a0fc441845bf" as const;

export const P0_SANDBOX_FIXTURE_DEMO_LINES = `demo-rec-001 → open
demo-rec-002 → ready` as const;

/** TrueForge wire event for sandbox provisioning. */
export const P0_TRUEFORGE_SANDBOX_CREATED_WIRE_TYPE = "sandbox.created" as const;

/** TrueForge wire event announcing a sandbox-produced file ready for extraction (P0-312). */
export const P0_TRUEFORGE_SANDBOX_FILE_WIRE_TYPE = "sandbox.file" as const;

/**
 * Environment variable names that must never appear inside a Daytona sandbox (SEC-021 / ADR-005).
 */
export const P0_SANDBOX_CREDENTIAL_CANARY_ENV_KEYS = [
  "COMPOSIO_API_KEY",
  "COMPOSIO_CONNECTED_ACCOUNT_ID",
  "COMPOSIO_AUTH_CONFIG_ID",
  "COMPOSIO_USER_ID",
  "TRUEFORGE_API_KEY",
  "OPENAI_API_KEY",
  "MODEL_PROVIDER_API_KEY",
  "DAYTONA_API_KEY",
  "DATABASE_URL",
  "ARTIFACT_STORAGE_DIR",
] as const;

/** External read tools forbidden on sandbox-enabled coworker profiles (OD-003 read slug). */
export const P0_SANDBOX_FORBIDDEN_SENSITIVE_READ_TOOLS = ["GITHUB_GET_AN_ISSUE"] as const;

/**
 * TrueForge harness / system tool name patterns that execute inside Daytona.
 * MCP tools are never sandbox command tools.
 */
export const P0_SANDBOX_COMMAND_TOOL_NAME_PATTERNS: readonly RegExp[] = [
  /^run_sandbox_/,
  /^sandbox_/,
  /run_terminal_cmd$/,
  /execute_code$/,
  /^write_file$/,
  /^read_file$/,
  /^run_command$/,
  /^code_run$/,
  /^execute_command$/,
];

export const P0_DAYTONA_API_BASE = "https://app.daytona.io/api" as const;

/** External URL used to measure whether outbound internet is reachable from a sandbox. */
export const P0_SANDBOX_EGRESS_PROBE_URL = "https://example.com" as const;
