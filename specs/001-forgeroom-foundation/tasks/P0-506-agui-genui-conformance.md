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

- [ ] Official-client and pinned-schema fixtures cover every required event family and illegal ordering.
- [ ] Full/compacted replay and every-cursor reconnect produce identical rich timeline projections.
- [ ] Every P0 AG-UI and controlled-GenUI case in `test-plan.md` passes without skips.
- [ ] Fixed registry, props, grant, renderer/data/state revision, bounded interaction and text-fallback fixtures pass; arbitrary HTML/script/URL/prototype payloads remain inert.
- [ ] `iframe_v1`, generated-document delivery routes/capabilities, native-subagent events and component catalogue are absent from production routing and typed as unsupported if received.
- [ ] Route/profile inspection proves P0 has no interaction-confirmation endpoint or registered `request_agent_turn`/`open_existing_hitl` mode; forged requests fail typed and enqueue nothing.
- [ ] Forged direct `RunAgentInput.resume` cannot bypass the canonical PauseGroup authorization/completeness/CAS/idempotency service.
- [ ] Accessibility checks cover chart/table summaries, bounded form errors, focus and reduced motion.
- [ ] Audit export contains controlled component hashes/lineage but no credential, reasoning, nonce or raw provider data.
- [ ] Deployment/route evidence confirms no P0 generated-source ingress/body field exists, unsupported requests persist nothing, and configured TrueForge/model/MCP retention is documented separately.
- [ ] Failure/cancel/timeout and reconnect leave no orphaned UI interrupt; logs and compressed Playwright traces contain no raw sensitive payload.
- [ ] Independent reviewer inspects registry/grant/interaction isolation and the trusted approval boundary.

## Verification

Run unit, integration, security and Playwright suites plus deployed route/feature-profile inspection. Attach reports and redacted fixtures.
