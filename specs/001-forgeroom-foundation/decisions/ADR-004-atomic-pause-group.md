# ADR-004 — Atomic PauseGroup and response-only resume

| Field | Value |
| --- | --- |
| Status | accepted |
| Date | 2026-08-25 |
| Deciders | Runtime and security review |

## Context

One TrueForge turn can end with several approvals and questions. All required responses belong in one later response turn. Creating a resume from each HTTP decision can race, cancel turns or duplicate external execution. P0 disables child threads; P1-209 must preserve this grouping invariant across child lineage before enabling them.

## Decision

Persist one PauseGroup per paused turn, one RequiredAction per provider action, and at most one PauseResume intent. Human decisions and answers update RequiredActions only. When all resolve, one compare-and-swap transaction creates the response intent. A worker creates one response-only turn and reconciles any uncertain create from TrueForge history before considering another attempt.

## Consequences

- Concurrent approvals cannot create competing turns.
- Questions and approvals wait for the complete group.
- Normal channel messages queue behind the group.
- Resume payload needs short-lived encrypted persistence for crash reconciliation.
- UI must distinguish recorded decision from execution.

## Rejected alternatives

- Resume in the approval HTTP handler: races and couples network work to user request.
- One resume per approval: violates complete required-action response semantics.
- Retry createTurn on timeout: may cancel the first live resume and duplicate effects.

## Verification

- Database uniqueness and CAS tests.
- Simultaneous allow/deny test.
- Mixed approval/question integration test.
- Lost create response history-reconciliation test.
- Assertion that resume contains no normal message.
