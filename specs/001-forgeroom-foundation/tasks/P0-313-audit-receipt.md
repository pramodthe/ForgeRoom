---
id: P0-313
title: Implement audit timeline and JSON receipt
status: done
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

- [x] Audit events are append-only and actor-attributed.
- [x] Receipt carries IDs, hashes, decisions, timestamps and adapter-verified receipt where available.
- [x] Receipt links Task/SkillVersion when present plus controlled UI surface/render/state/grant/interaction hashes and any later canonical proposal/result.
- [x] Generic tool response is labeled as such, not provider proof.
- [x] Export contains no credential, raw provider body, signature, fixture secret or model reasoning.
- [x] UI/API language says application history and declared lineage.

## Verification

Run receipt schema, redaction, append-only and source-to-result fixture tests.

## Completion evidence

- Tests/results:
  - `pnpm --filter @forgeroom/domain exec vitest run src/audit/receipt.test.ts` — pass (3)
  - `pnpm --filter @forgeroom/api exec vitest run src/runs/receipt.test.ts` — pass (1)
  - `pnpm --filter @forgeroom/api exec vitest run src/runs/receipt.integration.test.ts` — pass with `DATABASE_URL` (skipped in memory-only CI)
- Redacted receipt sample: `GET /api/runs/:runId/receipt` returns `disclaimer: "Application history with declared lineage. This is not cryptographic tamper evidence."` plus `receipt`/`receipt_hash` only.
