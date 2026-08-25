---
id: P0-313
title: Implement audit timeline and JSON receipt
status: blocked
owner: unassigned
depends_on: [P0-203, P0-309, P0-312, P0-315]
requirements: [AU-001, AU-002, AU-003, AU-004]
specs: [../security.md#audit-claims, ../data-model.md#artifacts-and-audit]
adrs: [ADR-002]
touches: [packages/domain, apps/api, packages/db]
---

# P0-313 — Implement audit timeline and JSON receipt

## Outcome

Completed Runs expose safe append-only application history linking declared source, sessions, steps, Task, skill lineage, artifact, proposal and verified result.

## Acceptance criteria

- [ ] Audit events are append-only and actor-attributed.
- [ ] Receipt carries IDs, hashes, decisions, timestamps and adapter-verified receipt where available.
- [ ] Receipt links Task/SkillVersion when present plus controlled UI surface/render/state/grant/interaction hashes and any later canonical proposal/result.
- [ ] Generic tool response is labeled as such, not provider proof.
- [ ] Export contains no credential, raw provider body, signature, fixture secret or model reasoning.
- [ ] UI/API language says application history and declared lineage.

## Verification

Run receipt schema, redaction, append-only and source-to-result fixture tests.

## Completion evidence

- Tests/results:
- Redacted receipt sample:
