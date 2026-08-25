---
id: P0-301
title: Configure Composio direct-tools session
status: blocked
owner: unassigned
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

- [ ] Stable workspace service-user ID is used.
- [ ] Two to four exact tools across at most two apps are exposed.
- [ ] `connectedAccounts` pins every toolkit to exact IDs.
- [ ] Multi-account fallback, meta-execute, workbench, remote bash, dynamic write search and Composio sandbox are absent.
- [ ] MCP URL/headers remain in server secrets.

## Verification

Run live session configuration/tool-list probe and negative assertions for forbidden surfaces. Store only redacted evidence.

## Completion evidence

- Redacted session/tool evidence:
- Negative assertions:
