---
id: P0-504
title: Implement complete browser end-to-end scenario
status: blocked
owner: unassigned
depends_on: [P0-109, P0-213, P0-305, P0-309, P0-312, P0-313, P0-318, P0-407, P0-408, P0-410]
requirements: [CH-005, OR-001, AG-010, TR-001, SK-001, AGUI-003, GUI-001, GUI-011, AP-008, SB-001]
specs: [../test-plan.md#browser-end-to-end-scenario, ../demo.md#demo-narrative]
adrs: [ADR-001, ADR-003, ADR-004, ADR-005, ADR-006, ADR-007]
touches: [e2e-tests]
---

# P0-504 — Implement complete browser end-to-end scenario

## Outcome

One reliable Playwright test proves conversational coworker creation, two-coworker work, a Task, controlled GenUI, sandbox artifact, approval, refresh, receipt and Save-as-skill.

## Acceptance criteria

- [ ] Executes every numbered scenario in `test-plan.md`.
- [ ] Denial verifies unchanged provider state before revised request.
- [ ] Refresh restores exact pending proposal.
- [ ] A controlled chart/table and bounded interaction render inline and survive refresh with identical revisions/hashes.
- [ ] Creating the second coworker shows an exact permission preview and one confirmed provisioning result.
- [ ] A canonical Task survives refresh and an authorized transition; a completed Run publishes and attaches one reviewed private skill.
- [ ] Native subagent, coordinator, component-catalogue and generated-frame surfaces are absent.
- [ ] Approval reaches expected deterministic state under read reconciliation.
- [ ] Uses accessible locators and event waits, not fixed sleeps.
- [ ] Captures trace/screenshots without credentials, personal data, raw provider bodies or model reasoning; compressed trace scan proves redaction.

## Verification

~~~bash
pnpm test:e2e
~~~

Run three consecutive times after fixture reset to detect flakiness.

## Completion evidence

- Report/trace paths:
- Three-run results:
