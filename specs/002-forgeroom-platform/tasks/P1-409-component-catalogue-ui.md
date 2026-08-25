---
id: P1-409
title: Build component catalogue, preview and grant UI
status: blocked
owner: unassigned
depends_on: [P1-000, P1-101, P1-103]
requirements: [GUI-002, GUI-004, GUI-005, GUI-013]
specs: [../ux.md, ../contracts/api.md#controlled-component-catalogue-and-grants, ../../001-forgeroom-foundation/ux.md#p1-components-screen, ../../001-forgeroom-foundation/contracts/api.md#components-and-ui-instances]
adrs: [ADR-007]
touches: [apps/web, apps/api, packages/ui, packages/contracts, packages/domain, packages/db, packages/integrations/trueforge]
release_gate: optional
---

# P1-409 — Build component catalogue, preview and grant UI

## Outcome

The owner can inspect what each coworker may render, preview every supported controlled component and grant/revoke it explicitly.

This is a non-gating 0.2 enhancement; the fixed code-owned P0 registry remains supported without it.

## Acceptance criteria

- [ ] Catalogue shows name/kind/version, description, preview, hash, declared reads/intents and publication state.
- [ ] Per-coworker positive render grants and separate data-function grants are understandable and keyboard accessible.
- [ ] Save warns about affected session rotation and stale offered tools.
- [ ] Preview uses checked-in sample props and the same production renderer/error boundary.
- [ ] No runtime source editor or reusable arbitrary-code component publisher appears in the alpha.
- [ ] Revocation becomes visible in an active channel and prevents the next call.
- [ ] Grant/revoke binds exact coworker runtime revision, component/data-function version, descriptor hash, channel scope and policy/catalogue revision, and rotates only affected sessions.

## Verification

Run authorization/grant mutation tests, keyboard/axe checks and catalogue/preview visual snapshots.
