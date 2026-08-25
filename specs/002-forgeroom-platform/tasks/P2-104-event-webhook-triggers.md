---
id: P2-104
title: Implement verified webhook and domain-event triggers
status: blocked
owner: unassigned
depends_on: [P2-102]
requirements: [WF-003, WF-005, WF-010, PSEC-007]
specs: [../workflows.md, ../data-model.md, ../contracts/api.md, ../contracts/events.md, ../security.md]
release_gate: required
---

# P2-104 — Implement event and webhook triggers

## Outcome

Allowed internal events and signed provider webhooks start exactly attributable, deduplicated workflows without becoming an unbounded loop or injection path.

## Acceptance criteria

- [ ] Each provider adapter verifies signature, timestamp, account, body hash and replay window before parsing.
- [ ] Raw payload is size-limited, retained/redacted by policy and converted to a closed normalized trigger schema.
- [ ] Authenticated ingress persists independently of matching: pre-match rejection is retained, one endpoint delivery may evaluate against multiple exact trigger/version contracts, and internal ingress binds a durable DomainEvent ID.
- [ ] Domain-event triggers require explicit event/aggregate/filter allowlists and current destination grants.
- [ ] Trigger occurrence dedupe survives retry, reordering and worker restart.
- [ ] Hop count, causal chain and loop keys stop self-trigger and cross-workflow cycles visibly.
- [ ] Secret rotation supports overlap/revocation and never exposes signing material to coworkers/browser.

## Verification

Run official provider fixtures plus forged, stale, replayed, oversized, reordered, rotated-secret and loop scenarios.

## Evidence

- Provider fixtures:
- Security report:
