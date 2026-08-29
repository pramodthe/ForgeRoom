---
id: P0-315
title: Implement component tool bridge, UIInstances and interaction gateway
status: done
owner: unassigned
depends_on: [P0-201, P0-208, P0-211, P0-212, P0-314]
requirements: [PLAT-006, GUI-004, GUI-005, GUI-008, GUI-009, GUI-010, GUI-011, GUI-014]
specs: [../runtime.md#component-tool-bridge, ../generative-ui.md#interaction-gateway, ../contracts/api.md#components-and-ui-instances]
adrs: [ADR-006, ADR-007]
touches: [packages/orchestration, packages/integrations/ag-ui, packages/ui, apps/api, apps/worker]
---

# P0-315 — Implement component tool bridge, UIInstances and interaction gateway

## Outcome

TrueForge can call a granted frontend component, persist its exact instance and safely continue after bounded user interaction.

## Acceptance criteria

- [x] Browser renderer tools are advertisements; server offers only its grant intersection to TrueForge. *(`packages/orchestration/src/capability-intersection.ts:147` `intersectEffectiveComponentTools`)*
- [x] Publication/version/schema/descriptor/grant recheck occurs after complete args and immediately before instance creation. *(two-checkpoint `recheckBrokerComponentAuthority`; checkpoint 2 takes `FOR SHARE` on the session, version and grant rows — PR #46)*
- [x] Component descriptor/grant changes block affected queue claims, rotate offered-tool session revisions and stale old offers.
- [x] Complete props validate server-side and client-side; one tool call creates one immutable UIInstance lineage. *(server-side validation + immutable lineage in broker path; client-side prop-schema validation in P0-316 `validateControlledProps` + fixture gallery tests)*
- [x] Server broker returns ordinary render results without a live browser; interactive waiting is represented by a durable interrupt, not an ephemeral callback. *(`packages/integrations/ui-components-mcp/src/protocol.ts:119-137` structured `callTool` result)*
- [x] `UIComponentInterrupt` is application-owned and distinct from PauseGroup: one bounded result CAS-resolves it and enqueues one structured same-RunStep continuation on the exact session generation; duplicates/stale generations cannot enqueue and no generic UI endpoint calls `RunAgentInput.resume`.
- [x] Data functions are reviewed read-only handlers with independent grants and row/byte/time limits. *(row/byte/time enforced in `packages/db/src/retained-data-grants.ts` `applySnapshotLimits` and `packages/db/src/ui-data-functions.ts`; closeout [P0-317](./P0-317-data-function-time-limits.md))*
- [x] server_read ActionGrant binds an exact independent DataGrant/data_ref/selection scope and succeeds only while both grants are current; the ActionGrant alone cannot choose/read data.
- [x] Trusted host obtains a one-use interaction token bound to user/channel/instance/render revision/render-node/ActionGrant/input hash/expiry; commit is idempotent and the token is never model-authored. *(`packages/db/src/ui-interactions.ts:79,97,390-391,449,523-533` hashed tokens, `max_uses`, `expires_at`, owned idempotency key)*
- [x] ActionGrant component binding uses the exact render-node ID from the immutable manifest, never the registry `ui_components.id` identity. *(manifest render-node ids `node_1` replace hardcoded `"root"`)*
- [x] A P0 controlled interaction can resolve only its exact UIComponentInterrupt or local/shared bounded state command; it cannot create/decide an ActionProposal, answer a canonical Question, resume a PauseGroup, enqueue an unrelated agent turn or invoke Composio/TrueForge. *(`packages/db/src/ui-interactions.ts:375-388,686` mode whitelist + typed `ActionGrant mode is unsupported in P0`)*
- [x] P0 registers no `request_agent_turn`, trusted-confirmation challenge, `/render-capabilities`, generated-document redemption or iframe delivery handler; those inputs return typed unsupported results. *(`apps/api/src/ui-instances/p0-exclusions.test.ts`)*
- [x] Grant expiry/revocation disables new resolution/interactions; replay uses only the retained validated controlled props/data/state and an inert fallback when unavailable. *(expiry/revocation integration tests; `packages/ui/components/src/component-host.tsx` inert fallback)*
- [x] Safe tool result continues the logical turn even when it starts a new AG-UI wire run.

## Verification

Run forged-tool, stale-grant, schema, data-grant, interaction-token replay, grant-use race, concurrent-state and multi-run continuation tests.

## Implementation progress

The gateway, broker tail and independent data handlers are implemented. All acceptance criteria
verified against merged code through P0-316 (client prop validation) and P0-317 (data-function
time bound).

- Client-side prop-schema validation → **P0-316** (`validateControlledProps`, fixture gallery).
- Data-function time limit → **P0-317** (`max_time_ms` on `DataGrant`).

- [x] Trusted-host registry token issuance and commit endpoints for `local_state`.
- [x] Exact instance/workspace/channel/actor, promoted render revision, manifest hash, render-node,
  ActionGrant, input-schema, expiry, and use-limit checks.
- [x] Hashed one-use tokens, encrypted retry-token persistence, stable idempotency-key replay,
  redacted safe input persistence, compare-and-swap state revisions, terminal-result idempotency,
  and concurrent-commit serialization.
- [x] Authenticated channel membership, Origin/CSRF mutation guards, closed request schemas, and
  controlled `provider_unavailable` error translation.
- [x] Component offer/recheck, finalize/quarantine, and scoped-interaction worker commands.
- [x] Component grant changes rotate offered-tool session revisions.
- [x] Component grant rotation blocks queue claims, rejects rotating/stale broker offers,
  and stales waiting component interrupts on restriction swaps.
- [x] `server_read` retained DataGrant resolution.
- [x] `complete_component_interrupt` CAS resolution and same-RunStep continuation enqueue.
- [x] TrueForge `ui_components_v1` MCP bridge and noninteractive broker tool-result path.
- [x] Component-interrupt continuation processor: `loadAgentTurnCreateContext`, response-only
  `createOrReconcileComponentContinuationTurn`, worker `create_or_reconcile_turn` branch, and
  `markComponentInterruptContinued` (`continued_at` / `state = continued`).
- [x] Broker channel projection: `forgeroom.controlled_ui.v1` `ACTIVITY_SNAPSHOT` on the durable
  channel timeline after MCP broker finalize.
- [x] Universal render grants for every brokered instance; manifest render-node ids (`node_1`) replace
  hardcoded `"root"` in revisions and ActionGrants.
- [x] Grant expiry/revocation integration tests for token issue and commit stale paths.
- [x] Unsupported P1 ActionGrant modes fail typed at token issue; commit rejects unsupported modes
  instead of silently marking interactions stale.
- [x] `POST /api/ui-instances/:instanceId/data/:functionName` authorize shell with registry +
  surface DataGrant checks; handlers return typed denial until registered.
- [x] Broker-time DataGrant provisioning for declared data functions with registry grants.
- [x] P0 `rows` data-function handler returns bounded retained snapshot reads.
- [x] P0 route guard: no `/render-capabilities` or P1 confirmation endpoints in ui-instance routes.
- [x] Broker rechecks publication/version/schema/descriptor/grant after complete args and again
  immediately before UIInstance creation; descriptor drift or missing grants quarantine.

- `pnpm --filter @forgeroom/db typecheck`
- `pnpm --filter @forgeroom/db exec vitest run src/ui-interactions.integration.test.ts`
- `pnpm --filter @forgeroom/api exec vitest run src/ui-instances/ui-instances.test.ts`
- `pnpm --filter @forgeroom/api exec vitest run src/components/component.test.ts`
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
- Qodo fast pre-PR review: clean after the reliability fixes.

## Work log

- 2026-08-29 — Task marked `done`; deferred client validation (P0-316) and time bound (P0-317) closed.
