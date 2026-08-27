---
id: P0-402
title: Build channel composer and coworker roster
status: in_review
owner: cursor-agent
started: 2026-08-26
depends_on: [P0-106, P0-107, P0-205, P0-401]
requirements: [CH-001, CH-003, CH-009, CH-010, CH-011, AG-006]
specs: [../ux.md#channel-header, ../ux.md#composer-and-recipient-resolution]
adrs: [ADR-001]
touches: [apps/web, packages/ui, apps/api, packages/contracts]
---

# P0-402 — Build channel composer and coworker roster

## Outcome

Owner can manage channel membership and send only after seeing exact recipients and effective tool summaries.

## Acceptance criteria

- [x] Roster shows name, role, availability and assignment.
- [x] Add/remove coworker and the New coworker entry point work; coordinator selection is absent in P0.
- [x] One mention, multiple mentions and `@team` have correct previews.
- [x] Ambiguous/disabled/rotating recipients block send with clear resolution.
- [x] No synthesis toggle or recursive-dispatch control appears in P0.
- [x] Human file attachment is absent from P0.

## Verification

Run component and browser tests for all routing combinations and keyboard composer use.

## Completion evidence

- Files changed:
  - `packages/contracts/src/channel-roster.ts` — roster view schema
  - `apps/api/src/workspace/{service,routes}.ts` — `GET /api/channels/:channelId/roster`
  - `apps/api/src/auth/service.ts` — normalize session `expires_at` for contract datetime guard
  - `apps/web/src/api/{http-client,unauthorized,workspace-api}.ts` — live API client + 401 session clear
  - `apps/web/src/auth/session-context.tsx`, `apps/web/src/shell/workspace-layout.tsx` — session expiry redirect guard
  - `apps/web/src/shell/{channel-header,channel-composer,composer-routing*}.tsx`
  - `apps/web/src/shell/authenticated-channel-redirect.tsx` — live default channel resolution for login/index redirects
- Commands:
  - `pnpm format` (Prettier on touched web/api files)
  - `pnpm --filter @forgeroom/api test` (64 pass, includes roster endpoint test)
  - `pnpm --filter @forgeroom/web test` (23 pass, includes composer routing + send-command matrix)
  - `pnpm --filter @forgeroom/web typecheck`
  - `pnpm --filter @forgeroom/web build`
- Browser (1440px): logged-in channel workroom shows roster/composer; archived channel disables membership controls and composer with inline status/errors.

## Work log

- 2026-08-26 — Claimed on branch `codex/p0-402-composer-roster`.
  - Wired live workspace API (mock retained under vitest `MODE=test`).
  - Added channel roster query endpoint and header/composer UI with `@forgeroom/orchestration` recipient preview parity.
- 2026-08-26 — Closeout before PR.
  - Submit previewed `recipient_handles` / `routing_mode` via `buildComposerMessageCommand`.
  - Session-expiry guard: workspace layout redirects to login when session clears; API 401 clears session; auth service normalizes Postgres session datetimes for `/api/session`.
  - Archived channels disable membership controls and surface API/mutation errors; roster shows “No active assignment” when absent.
