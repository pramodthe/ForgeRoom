---
id: P1-211
title: Implement reviewable scoped memory and retrieval
status: blocked
owner: unassigned
depends_on: [P1-101, P1-102, P1-202]
requirements: [MEM-001, MEM-002, MEM-003, MEM-004, MEM-005, MEM-006, MEM-007, MEM-008, MEM-009]
specs: [../memory.md, ../data-model.md, ../contracts/api.md]
release_gate: required
---

# P1-211 — Implement scoped memory

## Outcome

Durable memory is proposed from sourced evidence, explicitly accepted where required, versioned, scoped and explainable at retrieval time.

## Acceptance criteria

- [ ] MemoryProposal, Memory, MemoryRevision, stable subject/conflict key and grants implement every documented user/coworker/channel/record/workspace scope without overloading one ambiguous ID.
- [ ] Every factual memory retains source references, author/proposer, confidence, created/verified/expiry times and policy revision.
- [ ] Sensitive or cross-scope proposals require explicit authorized acceptance; model prose alone never commits memory.
- [ ] Retrieval returns `whyKnown` sources and intersects current actor/coworker/channel grants.
- [ ] Edit creates a revision; delete/expire/revoke prevents new retrieval and propagates to indexes/caches.
- [ ] Contradictions and stale sources are visible and never silently merged into a false current fact.

## Verification

Run proposal injection, cross-scope, accept/deny, concurrent edit, expiry, source deletion, contradiction and retrieval explanation tests.

## Evidence

- Contracts/migrations:
- Test report:
- Explanation fixture:
