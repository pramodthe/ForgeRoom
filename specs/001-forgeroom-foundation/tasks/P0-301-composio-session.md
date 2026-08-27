---
id: P0-301
title: Configure Composio direct-tools session
status: done
owner: cursor-agent
started: 2026-08-27
completed: 2026-08-27
depends_on: [P0-000, P0-101]
requirements: [TL-001, TL-002, TL-003, TL-004, TL-005]
specs: [../runtime.md#composio-session]
adrs: [ADR-003]
touches: [packages/integrations/composio, deployment-secrets]
---

# P0-301 — Configure Composio direct-tools session

## Outcome

One hosted MCP session exposes only the Phase 0 direct tools through exact pinned connected accounts.

## Acceptance criteria

- [x] Stable workspace service-user ID is used.
- [x] Two to four exact tools across at most two apps are exposed.
- [x] `connectedAccounts` pins every toolkit to exact IDs.
- [x] Multi-account fallback, meta-execute, workbench, remote bash, dynamic write search and Composio sandbox are absent.
- [x] MCP URL/headers remain in server secrets.

## Verification

Run live session configuration/tool-list probe and negative assertions for forbidden surfaces. Store only redacted evidence.

## Work log

- 2026-08-27 — Claimed as next actionable P0 (deps P0-000/P0-101 done; unlocks P0-302). Implemented `ComposioSessionClient` for `POST /api/v3.1/tool_router/session` with github toolkit, three literal direct tools, pinned `connected_accounts`, and forbidden surfaces disabled. Live probe confirmed exact tool list; MCP URL/headers stay process-side only (redacted evidence in `provider-fixtures/composio/session.verified.json`). TrueForge header-auth connector registration remains P0-302.

## Completion evidence

- Redacted session/tool evidence: `provider-fixtures/composio/session.verified.json` (user `forgeroom_workspace_1`, tools `GITHUB_GET_AN_ISSUE` / `GITHUB_ADD_LABELS_TO_AN_ISSUE` / `GITHUB_REMOVE_A_LABEL_FROM_AN_ISSUE`, account suffix `nizY`, mcp host `backend.composio.dev`).
- Negative assertions: unit tests reject forbidden meta surfaces, multi-account pins, and enabled search/multi-execute/workbench; live probe asserts absence of `COMPOSIO_SEARCH_TOOLS`, `COMPOSIO_MULTI_EXECUTE_TOOL`, `COMPOSIO_REMOTE_WORKBENCH`, `COMPOSIO_REMOTE_BASH_TOOL`, `COMPOSIO_MANAGE_CONNECTIONS`.
- Tests/results: `pnpm --filter @forgeroom/composio test` (7 passed incl. live probe); `pnpm --filter @forgeroom/composio typecheck`.
