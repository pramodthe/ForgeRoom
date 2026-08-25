---
id: P2-501
title: Complete workflow, team and extension security/recovery suite
status: blocked
owner: unassigned
depends_on: [P2-106, P2-201, P2-202, P2-203, P2-204, P2-205]
requirements: [CW-012, WF-005, WF-007, WF-008, WF-010, WF-011, WF-012, TEAM-008, PSEC-007, PSEC-012]
specs: [../test-plan.md, ../security.md]
release_gate: required
---

# P2-501 — Complete beta security/recovery suite

## Outcome

Unattended work, human delegation, connections and extensions survive adversarial concurrency and failure without bypassing authority or losing lineage.

## Acceptance criteria

- [ ] Workflow and team matrices pass without skipped release cases.
- [ ] Scheduler/trigger duplicates, worker death, retry exhaustion and disaster recovery never cause an untracked duplicate effect.
- [ ] Forged/replayed webhook, causal loops and cross-channel data smuggling fail.
- [ ] Approval group/delegation/account changes invalidate new authority at decision/claim time.
- [ ] Malicious extension fixtures cannot escape declared capabilities or corrupt the host.
- [ ] Independent reviewer signs the automation threat model and evidence.

## Verification

Run full unit/integration/security/chaos suites in the supported topology.

## Evidence

- Reports:
- Failure traces:
- Reviewer:
