---
id: P2-103
title: Implement time-zone-aware schedules
status: blocked
owner: unassigned
depends_on: [P2-102]
requirements: [WF-003, WF-004, WF-011]
specs: [../workflows.md, ../contracts/api.md]
release_gate: required
---

# P2-103 — Implement schedules

## Outcome

Authorized workflows run on predictable time-zone-aware schedules with explicit DST, misfire, overlap and pause behavior.

## Acceptance criteria

- [ ] Supported recurrence grammar is parsed server-side and previewed as exact next occurrences in the selected IANA zone.
- [ ] DST gaps/folds, leap/calendar edges and time-zone database changes follow documented deterministic policy.
- [ ] Misfire, catch-up and overlap policies are bounded and visible.
- [ ] Scheduler failover/double polling produces one trigger occurrence and one dedupe key.
- [ ] Pause/disable/update is revision-bound and prevents future claims without falsifying already-started Runs.
- [ ] Every occurrence records scheduled/claimed/started time and delay reason.

## Verification

Run time-zone corpus, DST folds/gaps, outage/misfire, concurrent scheduler, update and pause tests with a fake clock.

## Evidence

- Recurrence corpus:
- Scheduler report:
