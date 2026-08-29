---
id: P0-506
title: Complete AG-UI and generative-UI conformance/security evidence
status: blocked
owner: unassigned
depends_on: [P0-211, P0-212, P0-308, P0-313, P0-314, P0-315, P0-316, P0-408]
requirements: [AGUI-001, AGUI-003, AGUI-004, AGUI-006, AGUI-008, GUI-001, GUI-004, GUI-007, GUI-011, GUI-013, GUI-014]
specs: [../test-plan.md#ag-ui-and-generative-ui, ../generative-ui.md#acceptance-tests, ../security.md]
adrs: [ADR-006, ADR-007]
touches: [packages/test-fixtures, tests/integration, tests/security, tests/e2e]
---

# P0-506 — Complete AG-UI and generative-UI conformance/security evidence

## Outcome

Pinned protocol, replay and controlled-component guarantees have automated evidence and an independently reviewed browser proof.

## Acceptance criteria

- [x] Official-client and pinned-schema fixtures cover every required event family and illegal ordering.
- [x] Full/compacted replay and every-cursor reconnect produce identical rich timeline projections.
- [ ] Every P0 AG-UI and controlled-GenUI case in `test-plan.md` passes without skips.
- [x] Fixed registry, props, grant, renderer/data/state revision, bounded interaction and text-fallback fixtures pass; arbitrary HTML/script/URL/prototype payloads remain inert.
- [x] `iframe_v1`, generated-document delivery routes/capabilities, native-subagent events and component catalogue are absent from production routing and typed as unsupported if received.
- [x] Route/profile inspection proves P0 has no interaction-confirmation endpoint or registered `request_agent_turn`/`open_existing_hitl` mode; forged requests fail typed and enqueue nothing.
- [x] Forged direct `RunAgentInput.resume` cannot bypass the canonical PauseGroup authorization/completeness/CAS/idempotency service.
- [x] Accessibility checks cover chart/table summaries, bounded form errors, focus and reduced motion.
- [x] Audit export contains controlled component hashes/lineage but no credential, reasoning, nonce or raw provider data.
- [ ] Deployment/route evidence confirms no P0 generated-source ingress/body field exists, unsupported requests persist nothing, and configured TrueForge/model/MCP retention is documented separately.
- [x] Failure/cancel/timeout and reconnect leave no orphaned UI interrupt; logs and compressed Playwright traces contain no raw sensitive payload.
- [x] Independent reviewer inspects registry/grant/interaction isolation and the trusted approval boundary.

## Verification

Run unit, integration, security and Playwright suites plus deployed route/feature-profile inspection. Attach reports and redacted fixtures.

## Evidence (2026-08-29)

- `provider-fixtures/ag-ui/p0-event-profile.fixture.json` plus `packages/integrations/ag-ui/src/event-conformance.test.ts` cover the complete required event profile through the pinned official client and fail-closed state/activity/tool ordering cases; the AG-UI package passes 47/47 tests.
- `apps/web/src/ag-ui/channel-timeline-reducer.test.ts` verifies full/compacted replay and reconnect from every cursor preserve message, run, tool, activity and UI-state projections.
- Closed registry/props/grant/revision/interaction cases are covered by passing focused contracts, controlled-component, orchestration and database suites; recorded results include contracts 36/36, orchestration 11/11 and database bridge/interaction/replay 21/21.
- P0 route/profile exclusion is covered by `packages/contracts/src/unsupported.test.ts`, `packages/db/src/p0-exclusions.test.ts`, `apps/api/src/ui-instances/p0-exclusions.test.ts`, and `packages/db/src/ui-interactions.integration.test.ts`; a forged retained P1 mode returns `ui_interaction_not_allowed` without increasing queue rows.
- Direct resume authorization is covered by `apps/api/src/ag-ui/routes.integration.test.ts`, `packages/orchestration/src/pause-resume.test.ts`, and the database PauseGroup/PauseResume integration suites.
- `packages/ui/components/src/a11y/controlled-fixture-a11y.test.tsx` covers the five controlled fixtures with axe, chart/table equivalent summaries, bounded form error alerts and focus preservation; `apps/web/src/a11y/layout-baseline.test.ts` checks the reduced-motion profile.
- `packages/domain/src/audit/receipt.test.ts` and `apps/api/src/runs/receipt.integration.test.ts` verify controlled UI lineage hashes and exclude credential/provider bodies.
- `packages/db/src/ui-component-interrupts.ts`, `run-control.integration.test.ts` and `turn-lifecycle.integration.test.ts` atomically stale waiting interrupts, revoke their action grants and invalidate issued interaction tokens on provider failure and the shared cancel/watchdog-timeout path; terminal settle is an idempotent backstop. Existing component continuation/session-rotation and every-cursor replay tests cover reconnect without an orphaned waiting interrupt.
- `apps/e2e/helpers/trace-redaction.test.ts` proves the artifact scanner detects a secret canary that is absent from raw ZIP bytes but present after decompression, fails closed for unreadable archives and does not scrub a known fixture credential before evaluation; the same scanner covers JSON/text logs and is enforced by the prototype, live API and provider Playwright suites. Focused result: 5/5 passed.
- Independent review found and drove fixes for cross-route PauseGroup resume, canonical action-alias completeness, ciphertext-only responses/reasons, provider-authored credential redaction, linked request-changes lifecycle recovery and trace evidence integrity. The post-fix re-review passed 41/41 focused tests and accepted the registry/grant/interaction and trusted-approval boundary; provider/deployment gates below remain separate.

## Remaining release blockers

- The complete `test-plan.md` AG-UI/controlled-GenUI matrix still needs a no-skip release run, including provider-backed Playwright evidence.
- A deployed route/feature-profile inspection and deployment-specific TrueForge/model/MCP retention disclosure are still required.
