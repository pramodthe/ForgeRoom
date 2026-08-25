---
id: P0-505
title: Complete preflight, documentation and demo rehearsal
status: blocked
owner: unassigned
depends_on: [P0-313, P0-501, P0-502, P0-503, P0-504, P0-506]
requirements: [AU-003, OSS-001]
specs: [../demo.md, ../checklists/requirements.md, ../checklists/security.md, ../checklists/demo.md, ../../002-forgeroom-platform/open-source.md, ../../002-forgeroom-platform/decisions/OPEN.md]
adrs: []
touches: [README.md, preflight, demo-assets]
---

# P0-505 — Complete preflight, documentation and demo rehearsal

## Outcome

A clean clone can run the product, preflight all dependencies, pass release gates and deliver the three-minute demo repeatedly.

## Acceptance criteria

- [ ] Preflight reports database, auth, TrueForge, model, Daytona, Composio account/tools, AgentSpec approvals, storage, worker, AG-UI package graph, fixed component registry, CoworkerDraft/Task/skill readiness and confirms disabled P1 capabilities without secrets.
- [ ] Clean-clone README setup succeeds.
- [ ] Before any public repository/release artifact, PD-002 is closed and the approved `LICENSE`, `NOTICE`, dependency-license review and hosted/commercial boundary are committed/documented.
- [ ] All P0 tasks and checklists are done.
- [ ] Fixture reset and three consecutive E2E runs pass.
- [ ] Three-minute script is rehearsed three times within time.
- [ ] Rehearsal visibly proves conversational coworker creation, one Task, a controlled chart/table, one bounded interaction, trusted approval and Save-as-skill.
- [ ] Required review evidence is linked.
- [ ] STATUS shows no P0 blocker.

## Verification

Run the full release command set from `test-plan.md`, then complete and independently review every checklist.

## Completion evidence

- Clean-clone commands/results:
- Preflight screenshot:
- Demo timing:
- Review links:
