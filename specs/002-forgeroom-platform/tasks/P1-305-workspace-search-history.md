---
id: P1-305
title: Implement permission-safe workspace search and Run history
status: blocked
owner: unassigned
depends_on: [P1-101, P1-102, P1-103, P1-202, P1-211, P1-301, P1-302]
requirements: [SRCH-001, SRCH-002, SRCH-003, SRCH-004, SRCH-005, SRCH-006, SRCH-007, SRCH-008]
specs: [../search.md, ../data-model.md, ../contracts/api.md, ../security.md, ../ux.md]
release_gate: required
---

# P1-305 — Implement workspace search and Run history

## Outcome

Authorized members can find messages, records, coworkers, sources, skills, memories, Runs and artifacts from one typed search surface with no private-scope leakage.

## Acceptance criteria

- [ ] Versioned search projections consume domain/channel events idempotently and rebuild through snapshot plus catch-up.
- [ ] Query/filter/count/facet/candidate/snippet/open paths enforce current workspace/channel/resource/field authorization.
- [ ] Typed results pin resource revision, safe snippet/provenance, freshness and canonical authorization-checked link.
- [ ] Revocation/deletion/quarantine prevents new results immediately from authoritative state despite stale index/cache entries.
- [ ] Run-history results connect safe request/step/tool/approval/Task/record/artifact/skill/receipt lineage without raw payload/reasoning.
- [ ] Query parsing, limits, pagination, highlighting, logs and analytics pass injection/resource/privacy controls.
- [ ] Global search UX passes keyboard/screen-reader/responsive states and does not autocomplete inaccessible resources.

## Verification

Run cross-workspace/private-channel/field tests at candidate/count/snippet/open layers, revoke/delete during query, lag/rebuild, malformed/expensive queries, history lineage and browser accessibility tests.

## Evidence

- Index/query contracts:
- Security/rebuild report:
- Screenshots:
