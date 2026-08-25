---
id: P1-504
title: Release and validate the 0.2 private alpha
status: blocked
owner: unassigned
depends_on: [P1-502, P1-503]
requirements: [PLAT-001, PLAT-006, PLAT-007, PLAT-009, PLAT-010]
specs: [../roadmap.md#02-private-alpha, ../checklists/0.2-private-alpha.md, ../STATUS.md]
release_gate: required
---

# P1-504 — Release the private alpha

## Outcome

Five design-partner workspaces complete the defined two-week trial on a reproducible release with no unresolved critical authorization or data-loss defect.

## Acceptance criteria

- [ ] All required P1 tasks, tests, migrations, operator/user docs and evidence are complete.
- [ ] Signed/tagged release artifacts, changelog, known issues and upgrade/restore instructions are published.
- [ ] Five workspaces onboard with explicit support/privacy expectations and complete a two-week usage window.
- [ ] No unresolved critical data-loss/authorization defect; lower-severity exceptions have owner, mitigation and target release.
- [ ] Every memory/knowledge answer in sampled consequential flows has a current source or explicit no-source state.
- [ ] Product metrics and qualitative trial findings are recorded without collecting private content by default.
- [ ] Experimental coordinator/native/iframe work is excluded from the exit gate unless explicitly enabled and fully conformant.

## Verification

Review release provenance, completed task/evidence matrix, restore result, trial report and issue severity ledger.

## Evidence

- Release/tag:
- Trial report:
- Gate approval:
