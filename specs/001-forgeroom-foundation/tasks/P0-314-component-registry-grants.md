---
id: P0-314
title: Build the governed component registry, versions and grants
status: blocked
owner: unassigned
depends_on: [P0-102, P0-103, P0-104, P0-210]
requirements: [PLAT-006, GUI-002, GUI-004, GUI-005, GUI-011]
specs: [../generative-ui.md#controlled-react-registry, ../data-model.md#component-registry-and-generative-ui, ../contracts/api.md#components-and-ui-instances]
adrs: [ADR-007]
touches: [packages/contracts, packages/db, packages/domain, apps/api]
---

# P0-314 — Build the governed component registry, versions and grants

## Outcome

Published component versions and positive coworker/channel grants are immutable, auditable and default deny.

## Acceptance criteria

- [ ] Manifest includes stable name/version/kind, `agent_tool|server_only` exposure, description, schema, renderer, preview, reads, intents and descriptor hash; privileged HITL entries cannot be offered.
- [ ] Database enforces immutable versions, registry publication/data-function grants and independent per-surface Render/Data/Action grants with policy revision, expiry, revocation, limits, exact snapshot/schema/field provenance and render-revision/manifest binding.
- [ ] Fixed registry/version/grant APIs authenticate, authorize and expose safe metadata only; a browsable catalogue UI is a later release.
- [ ] Absence of a positive grant means unavailable; newly published components are never ambient.
- [ ] Grant change transaction emits the affected-session/rotation record; P0-208 owns queue blocking, session replacement and staling offered snapshots.
- [ ] The checked-in P0 registry is eagerly sorted and code-owned; frontend hook registration order does not change with availability.
- [ ] Audit records publish, grant, revoke, offer, allow and refuse decisions.

## Verification

Run migration/constraint, default-deny, scope intersection, descriptor drift and concurrent grant tests.
