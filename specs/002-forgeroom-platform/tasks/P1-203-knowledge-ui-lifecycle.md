---
id: P1-203
title: Build knowledge library, upload and source lifecycle UI
status: blocked
owner: unassigned
depends_on: [P1-103, P1-201, P1-202]
requirements: [KN-001, KN-004, KN-007, KN-009, KN-010]
specs: [../knowledge.md, ../ux.md]
release_gate: required
---

# P1-203 — Build knowledge UI

## Outcome

Members can add, inspect, scope, refresh and delete knowledge while seeing processing state, provenance and citation use.

## Acceptance criteria

- [ ] Drag/drop and picker flows show supported formats, limits, progress, cancel and actionable failures.
- [ ] URL/repository forms preview canonical source and requested access before ingest.
- [ ] Library filters by type/state/scope and shows revision, owner, freshness, access and last use.
- [ ] Source detail shows safe preview, parser warnings, citations/backlinks and refresh/delete effects.
- [ ] Grant changes and delete require trusted confirmation and never rely on generated UI.
- [ ] Keyboard, screen-reader, mobile and refresh/reconnect states pass the UX contract.

## Verification

Run component, browser, accessibility and visual tests over success, malicious, partial, stale, revoked and deleted fixtures.

## Evidence

- Screenshots:
- Accessibility report:
- Browser tests:
