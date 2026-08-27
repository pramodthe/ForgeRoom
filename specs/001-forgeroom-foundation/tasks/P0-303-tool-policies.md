---
id: P0-303
title: Implement curated ToolPolicyDefinitions
status: done
owner: cursor-agent
started: 2026-08-27
completed: 2026-08-27
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

- [x] Policy exists for every exact enabled tool and descriptor hash.
- [x] Target extraction and argument redaction cover sensitive fields.
- [x] Write preview and expected effect are deterministic server output.
- [x] Idempotency is verified, unknown or not-idempotent; never assumed.
- [x] Deterministic demo write has reconciliation query and receipt verifier or labeled safe result.
- [x] Unknown writes are blocked.

## Verification

Run golden descriptor, redaction, preview, adversarial argument, idempotency, reconciliation and receipt unit tests.

## Work log

- 2026-08-27 — Claimed after P0-302. Implemented curated ToolPolicyDefinitions for the three P0 Composio direct tools (`GITHUB_GET_AN_ISSUE`, `GITHUB_ADD_LABELS_TO_AN_ISSUE`, `GITHUB_REMOVE_A_LABEL_FROM_AN_ISSUE`) with descriptor-hash binding, allowlisted redaction, deterministic previews, explicit idempotency classes, demo write reconcile/receipt, and fail-closed unknown-write gate.

## Completion evidence

- Policies/files: `packages/integrations/composio/src/tool-policies/` (`types`, `args`, `policies`, `registry`); package export `@forgeroom/composio/tool-policies`; redacted fixture `provider-fixtures/composio/tool-policies.verified.json`.
- Golden tests/results: `pnpm --filter @forgeroom/composio test` (29 passed, 2 live skipped) including 9 ToolPolicyDefinition unit tests; `pnpm --filter @forgeroom/composio typecheck`.
