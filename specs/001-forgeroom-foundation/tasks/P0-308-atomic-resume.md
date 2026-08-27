---
id: P0-308
title: Implement atomic response-only resume
status: done
owner: cursor-agent
started: 2026-08-27
completed: 2026-08-27
depends_on: [P0-202, P0-211, P0-306, P0-307]
requirements: [AP-007, AP-009, AP-010, AP-011, AP-013]
specs: [../runtime.md#atomic-pausegroup-resume]
adrs: [ADR-004]
touches: [packages/orchestration, packages/integrations/ag-ui, apps/api, apps/worker, packages/db]
---

# P0-308 — Implement atomic response-only resume

## Outcome

One compare-and-swap-controlled durable intent resumes a complete PauseGroup with approvals and question responses only.

## Acceptance criteria

- [x] Group cannot resume until all items resolve.
- [x] CAS and unique constraint create one PauseResume.
- [x] Encrypted response payload is persisted before network call.
- [x] Turn contains complete responses and no normal message.
- [x] Lost create response becomes uncertain and reconciles from history.
- [x] Competing worker observes existing resume and never creates another.
- [x] `RunAgentInput.resume` is enabled only by delegating to this same membership/binding/completeness/expiry/CAS/idempotency service; forged interrupt IDs or direct payloads cannot bypass RequiredAction decisions.
- [x] Ciphertext expires after confirmed recovery window.

## Verification

Run mixed-action, concurrent-worker, forged direct-AG-UI-resume, crash-before/after-create and history-reconciliation integration tests.

## Work log

- 2026-08-27 — Claimed after P0-307. Implemented CAS PauseResume, response-only TrueForge turn create/reconcile, AG-UI resume delegation, question answer resolve helper, and ciphertext expiry.

## Completion evidence

- Tests/results:
  - `pnpm --filter @forgeroom/orchestration test -- pause-resume` — pass (response-only input, authorize forged/partial, history reconcile)
  - `pnpm --filter @forgeroom/db test -- pause-resume` — pass (incomplete blocked; mixed approve+answer → one CAS PauseResume; competing claim; ciphertext expiry)
  - `pnpm --filter @forgeroom/ag-ui test -- adapter` — pass (resume flagged for PauseGroup service)
  - `pnpm --filter @forgeroom/api test -- routes.test` — pass (capabilities resume via service; forged resume rejected)
  - `pnpm --filter @forgeroom/worker test` — pass
  - `pnpm --filter @forgeroom/{orchestration,db,ag-ui,api,worker} typecheck` — pass
- Redacted resume trace: `provider-fixtures/composio/pause-resume.verified.json`
- Worker: `claim_pause_group_resume` CAS + create/reconcile response-only turn
- AG-UI: resume enabled only via PauseGroup authorize → claim → encrypted payload → TrueForge
