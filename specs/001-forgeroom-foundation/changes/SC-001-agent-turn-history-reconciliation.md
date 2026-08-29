# SC-001 — Guarded AgentTurn history reconciliation

| Field | Value |
| --- | --- |
| Status | accepted |
| Requested by | release-compliance review |
| Date | 2026-08-29 |
| Affected requirements | RUN-002, RUN-003 |
| Affected tasks | P0-202, P0-501, P0-502 |

## Current contract

[`data-model.md`](../data-model.md#agentturn) makes `uncertain` terminal in the ordinary
AgentTurn graph, while [`runtime.md`](../runtime.md#turn-creation-and-crash-reconciliation)
requires a lost create response to recover after an exact TrueForge history match. The runtime
implementation previously accepted both `creating` and `uncertain` in one untyped persistence
update, so the recovery edge was neither explicit nor distinguishable from a create response.

## Proposed contract

Keep `uncertain` terminal in the ordinary transition graph. Add exactly one recovery-only edge:

~~~text
uncertain --[history match: application token + predecessor + input hash]--> streaming
~~~

Only a `bind_existing` decision produced by the history-reconciliation algorithm may use this
edge. A newly returned create response may bind only `creating → streaming`. `uncertain → creating`,
a second create after an ambiguous history result, and unverified `uncertain → streaming` remain
illegal.

## Reason

This resolves a release-review contract mismatch while preserving the fail-closed lost-response
rule. It makes recovery evidence part of the typed orchestration-to-persistence call instead of
relying on a broad list of caller-supplied expected states.

## Impact

- Product and UX: verified lost creates can resume; ambiguous cases still require attention.
- Architecture and data: no schema migration; the domain exposes a separate reconciliation guard.
- Security and privacy: ordinary transitions cannot use the recovery edge, and no raw provider
  payload becomes evidence.
- Tests and demo: unit tests distinguish create-response and history-reconciliation bindings;
  database integration tests reject an unverified bind from `uncertain`.
- Existing tasks or migrations: P0-501 and P0-502 gain explicit recovery coverage; P0-202's queue
  contract is unchanged.

## Migration and rollout

No stored shape changes. Existing `uncertain` rows stay uncertain until the same exact history
matcher returns one existing turn; deployments may then bind that turn using the recovery-only
source marker.

## Decision

Accepted as a clarification required to make the already-canonical crash-reconciliation contract
implementable. Canonical runtime and data-model text, domain guards, persistence, and tests are
updated together in this change.
