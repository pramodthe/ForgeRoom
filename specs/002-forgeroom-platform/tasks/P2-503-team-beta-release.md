---
id: P2-503
title: Release and validate the 0.3 team beta
status: blocked
owner: unassigned
depends_on: [P2-502]
requirements: [PLAT-005, PLAT-007, PLAT-009, PLAT-010]
specs: [../roadmap.md#03-team-beta, ../checklists/0.3-team-beta.md, ../STATUS.md]
release_gate: required
---

# P2-503 — Release the team beta

## Outcome

Three design partners run production-like scheduled workflows for 30 days with attributable, deduplicated, budgeted and governed outcomes.

## Acceptance criteria

- [ ] All required P2 tasks/tests/docs/migrations/evidence and parity matrix rows are complete.
- [ ] `parity.md` records current dated competitor sources and links every public ForgeRoom comparison row to released user docs, build SHA, automated report and trial evidence; uncertain rows remain qualified.
- [ ] Three partners complete the 30-day workflow trial with known schedules/triggers, owners and support plan.
- [ ] Every triggered Run is inspectable, stoppable, deduplicated and uses the canonical approval/action gateway.
- [ ] No unresolved critical/high authorization, duplicate-effect or data-loss issue remains.
- [ ] Workflow success/failure, approval precision, dead-letter age and notification delivery metrics are reported without private bodies.
- [ ] Signed release, changelog, compatibility notes and previous-release upgrade/restore evidence are published.

## Verification

Review trial data, issue ledger, parity E2E, recovery drills and release provenance.

## Evidence

- Release/tag:
- 30-day report:
- Gate approval:
