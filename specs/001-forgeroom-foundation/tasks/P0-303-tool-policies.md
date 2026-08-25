---
id: P0-303
title: Implement curated ToolPolicyDefinitions
status: blocked
owner: unassigned
depends_on: [P0-000, P0-302]
requirements: [AP-004, AP-005, TL-007, CN-004]
specs: [../runtime.md#toolpolicydefinition, ../security.md#approval-integrity]
adrs: [ADR-003]
touches: [packages/integrations/composio/tool-policies]
---

# P0-303 — Implement curated ToolPolicyDefinitions

## Outcome

Every enabled tool has reviewed server semantics for risk, safe display, idempotency, reconciliation and receipt handling.

## Acceptance criteria

- [ ] Policy exists for every exact enabled tool and descriptor hash.
- [ ] Target extraction and argument redaction cover sensitive fields.
- [ ] Write preview and expected effect are deterministic server output.
- [ ] Idempotency is verified, unknown or not-idempotent; never assumed.
- [ ] Deterministic demo write has reconciliation query and receipt verifier or labeled safe result.
- [ ] Unknown writes are blocked.

## Verification

Run golden descriptor, redaction, preview, adversarial argument, idempotency, reconciliation and receipt unit tests.

## Completion evidence

- Policies/files:
- Golden tests/results:
