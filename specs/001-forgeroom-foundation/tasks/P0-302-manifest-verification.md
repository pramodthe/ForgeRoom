---
id: P0-302
title: Implement connector and AgentSpec manifest verification
status: done
owner: cursor-agent
started: 2026-08-27
completed: 2026-08-27
depends_on: [P0-201, P0-301]
requirements: [TL-006, TL-007, CN-002, CN-003]
specs: [../runtime.md#startup-verification]
adrs: [ADR-003]
touches: [packages/integrations/trueforge, packages/integrations/composio]
---

# P0-302 — Implement connector and AgentSpec manifest verification

## Outcome

Startup independently proves the connector surface and compiled coworker enable/approval policy, failing closed on drift.

## Acceptance criteria

- [x] Exact connector tool names, schemas and annotations match checked-in descriptor hashes.
- [x] No unexpected tool appears in a coworker's compiled allowlist.
- [x] Literal enabled-tools and approval-required sets match policy hashes.
- [x] Exact pinned account status is active.
- [x] Missing, added, changed, expired or unapproved surfaces make health fail and block dispatch.

## Verification

Run passing live preflight and fixtures for missing tool, added tool, schema change, lost approval rule and expired account.

## Work log

- 2026-08-27 — Claimed after P0-301. Implemented Composio descriptor hashing + pinned-account health, fail-closed `verifyP0Manifest`, frozen enable/approval policy hashes for connector `composio_github`, and TrueForge header-auth MCP registration (`PUT /api/v1/settings/mcp-servers`) plus AgentSpec policy verification. Live Composio descriptor/account preflight passed; negative fixtures covered in unit tests.

## Completion evidence

- Tests/results: `pnpm --filter @forgeroom/composio test` (22 passed incl. live descriptor+ACTIVE account preflight); `pnpm --filter @forgeroom/trueforge test` (9 passed); `pnpm --filter @forgeroom/composio typecheck`; `pnpm --filter @forgeroom/trueforge typecheck`; `pnpm --filter @forgeroom/test-fixtures test`.
- Redacted preflight: `provider-fixtures/composio/preflight.verified.json` (connector `composio_github`, account suffix `nizY` ACTIVE, fail-closed fixtures listed; secrets absent).
