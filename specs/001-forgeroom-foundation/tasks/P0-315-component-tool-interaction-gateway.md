---
id: P0-315
title: Implement component tool bridge, UIInstances and interaction gateway
status: in_progress
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

- [ ] Browser renderer tools are advertisements; server offers only its grant intersection to TrueForge.
- [ ] Publication/version/schema/descriptor/grant recheck occurs after complete args and immediately before instance creation.
- [ ] Component descriptor/grant changes block affected queue claims, rotate offered-tool session revisions and stale old offers.
- [ ] Complete props validate server-side and client-side; one tool call creates one immutable UIInstance lineage.
- [ ] Server broker returns ordinary render results without a live browser; interactive waiting is represented by a durable interrupt, not an ephemeral callback.
- [ ] `UIComponentInterrupt` is application-owned and distinct from PauseGroup: one bounded result CAS-resolves it and enqueues one structured same-RunStep continuation on the exact session generation; duplicates/stale generations cannot enqueue and no generic UI endpoint calls `RunAgentInput.resume`.
- [ ] Data functions are reviewed read-only handlers with independent grants and row/byte/time limits.
- [ ] server_read ActionGrant binds an exact independent DataGrant/data_ref/selection scope and succeeds only while both grants are current; the ActionGrant alone cannot choose/read data.
- [ ] Trusted host obtains a one-use interaction token bound to user/channel/instance/render revision/render-node/ActionGrant/input hash/expiry; commit is idempotent and the token is never model-authored.
- [ ] ActionGrant component binding uses the exact render-node ID from the immutable manifest, never the registry `ui_components.id` identity.
- [ ] A P0 controlled interaction can resolve only its exact UIComponentInterrupt or local/shared bounded state command; it cannot create/decide an ActionProposal, answer a canonical Question, resume a PauseGroup, enqueue an unrelated agent turn or invoke Composio/TrueForge.
- [ ] P0 registers no `request_agent_turn`, trusted-confirmation challenge, `/render-capabilities`, generated-document redemption or iframe delivery handler; those inputs return typed unsupported results.
- [ ] Grant expiry/revocation disables new resolution/interactions; replay uses only the retained validated controlled props/data/state and an inert fallback when unavailable.
- [ ] Safe tool result continues the logical turn even when it starts a new AG-UI wire run.

## Verification

Run forged-tool, stale-grant, schema, data-grant, interaction-token replay, grant-use race, concurrent-state and multi-run continuation tests.

## Implementation progress

The first bounded interaction-gateway slice is complete; the task remains `in_progress` until the
component broker, independent data handlers, and durable component-interrupt continuation are
implemented.

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
- [ ] `server_read` retained DataGrant resolution.
- [ ] `complete_component_interrupt` CAS resolution and same-RunStep continuation enqueue.
- [x] TrueForge `ui_components_v1` MCP bridge and noninteractive broker tool-result path.

- `pnpm --filter @forgeroom/db typecheck`
- `pnpm --filter @forgeroom/db exec vitest run src/ui-interactions.integration.test.ts`
- `pnpm --filter @forgeroom/api exec vitest run src/ui-instances/ui-instances.test.ts`
- `pnpm --filter @forgeroom/api exec vitest run src/components/component.test.ts`
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
- Qodo fast pre-PR review: clean after the reliability fixes.
