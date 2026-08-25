---
id: P1-202
title: Implement scoped retrieval and verifiable citations
status: blocked
owner: unassigned
depends_on: [P1-103, P1-201]
requirements: [KN-004, KN-005, KN-006, KN-007, KN-008, PLAT-004]
specs: [../knowledge.md, ../contracts/api.md, ../architecture.md]
release_gate: required
---

# P1-202 — Implement retrieval and citations

## Outcome

Coworkers retrieve only current authorized chunks and every consequential answer can link to an exact source revision and location.

## Acceptance criteria

- [ ] Retrieval intersects workspace/channel/coworker/human grants at query and result-fetch time.
- [ ] Sources can be curated into version-aware collections with explicit discover/read/quote/export grants; collection membership never becomes ambient workspace RAG.
- [ ] Results carry source ID/revision, extraction ID/parser/index version, location/page/range, excerpt/citation hash, ingestion/extraction time and freshness state.
- [ ] Deleted, revoked, quarantined and superseded sources disappear from new retrieval promptly.
- [ ] Citation links reauthorize, open the exact supported location and degrade visibly when the revision is unavailable.
- [ ] No-result/low-confidence behavior says so explicitly instead of fabricating a citation.
- [ ] Retrieval/tool/audit logs store bounded metadata and not unnecessary source bodies.

## Verification

Run cross-channel/workspace, stale index, revoke-during-run, exact-location, no-result and citation tamper tests.

## Evidence

- Retrieval fixtures:
- Citation screenshots:
- Security/performance report:
