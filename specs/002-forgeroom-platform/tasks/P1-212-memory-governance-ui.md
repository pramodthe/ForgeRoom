---
id: P1-212
title: Build memory review, history and governance UI
status: blocked
owner: unassigned
depends_on: [P1-103, P1-211]
requirements: [MEM-003, MEM-004, MEM-006, MEM-007, MEM-008]
specs: [../memory.md, ../ux.md]
release_gate: required
---

# P1-212 — Build memory governance UI

## Outcome

Members can answer “what does this coworker know, why, who approved it and where is it used?” and safely edit or remove it.

## Acceptance criteria

- [ ] Pending proposals show exact text, scope, sources, sensitivity, expiry and affected coworkers before accept/deny.
- [ ] Memory lists filter by scope/status/source and show freshness/contradiction warnings.
- [ ] Detail view exposes immutable revision history, use/backlinks and `whyKnown` source links.
- [ ] Edit/delete/scope/expiry changes are revision-bound, permission checked and refresh safe.
- [ ] Empty/no-source/revoked/deleted/conflict states are explicit; hidden memory is never implied.
- [ ] Trusted controls pass keyboard, focus, axe and responsive visual checks.

## Verification

Run browser and accessibility scenarios for proposal, conflict, stale source, edit, delete, expiry and permission loss.

## Evidence

- Screenshots:
- Browser report:
- Accessibility report:
