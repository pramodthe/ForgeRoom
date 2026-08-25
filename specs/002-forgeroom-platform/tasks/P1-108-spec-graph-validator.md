---
id: P1-108
title: Add executable specification and release-graph validation
status: blocked
owner: unassigned
depends_on: [P1-000]
requirements: [PLAT-009, PLAT-010]
specs: [../traceability.md, ../roadmap.md, ../tasks.md]
release_gate: required
---

# P1-108 — Validate the specification graph in CI

## Outcome

CI rejects drift between canonical requirement IDs, first-release ownership, task front matter, indexes, dependencies, checklists and release gates.

## Acceptance criteria

- [ ] Every requirement ID has one declared canonical owner; earlier-slice mirrors either link to or exactly match that contract, conflicting duplicate definitions fail, and every task/checklist reference resolves.
- [ ] A task cannot claim a requirement before its declared first release unless explicitly marked optional/experimental.
- [ ] Every indexed task has one file and every task file is indexed; dependencies exist and the graph is acyclic.
- [ ] Every required task reaches exactly its release gate; optional/experimental work cannot become a required gate accidentally.
- [ ] Relative spec/anchor links, task counts, status summaries and traceability ranges are checked.
- [ ] Fixtures include duplicate IDs, stale links, cross-release claims, cycles, unreachable gates and optional-gate leaks.

## Verification

Run the validator against the clean tree and every intentionally broken fixture in CI.

## Evidence

- Validator/tests:
- CI run:
