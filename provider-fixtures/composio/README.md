# Composio fixture contract

Exact application slugs, direct-tool names, connected-account IDs and descriptor hashes are recorded in verified fixture rows after the 2026-08-26 live probe (redacted suffixes only in git).

## Rules (frozen)

- At most two applications; prefer one if it covers read + deterministic write + reconciliation read.
- Expose only literal pinned direct tools (two to four total).
- Pin every toolkit to an exact connected-account ID (redacted suffix recorded here; full ID only in secrets).
- Multi-execute, workbench, remote bash, dynamic write discovery, Composio sandbox and account fallback stay disabled (ADR-003).
- Prefer setting a known issue/record field to a known synthetic value; never use email/message creation to claim exactly-once.
- Check in observed descriptor hashes only after export from a live session.

## Files

| File                              | Status                                       |
| --------------------------------- | -------------------------------------------- |
| `applications.candidate.json`     | Verified github toolkit (probe 2026-08-26)   |
| `tools.candidate.json`            | Verified read/write/reconcile slugs + hashes |
| `accounts.verified.json`          | Redacted suffix `nizY` only                  |
| `accounts.redacted.template.json` | Suffix template only                         |
| `session.verified.json`           | P0-301 hosted MCP direct-tools session (redacted) |
| `preflight.verified.json`         | P0-302 connector/AgentSpec verification evidence |
| `tool-policies.verified.json`     | P0-303 curated ToolPolicyDefinition evidence |
| `real-read.verified.json`         | P0-305 real Composio read path evidence      |
| `pause-group.verified.json`       | P0-306 PauseGroup/RequiredAction capture evidence |
| `connections.verified.json`       | P0-304 Connections status/Test/Reconnect evidence |
| `descriptors/manifest.json`       | SHA-256 hashes from live descriptor export   |
