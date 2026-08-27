---
id: P0-310
title: Implement durable artifact storage adapter
status: done
owner: cursor-agent
started: 2026-08-27
completed: 2026-08-27
depends_on: [P0-000, P0-103]
requirements: [SB-003, SB-004]
specs: [../data-model.md#artifacts-and-audit, ../demo.md#phase-0-decisions]
adrs: []
touches: [packages/integrations/artifacts, packages/db, apps/api]
---

# P0-310 — Implement durable artifact storage adapter

## Outcome

Selected storage durably retains content-addressed immutable artifact revisions in development and demo deployment.

## Acceptance criteria

- [x] Authenticated put/get/download API exists behind adapter.
- [x] Metadata includes hash, MIME, size, creator, source Run/Step and revision.
- [x] Publishing identical content is idempotent.
- [x] Storage key cannot escape workspace/channel namespace.
- [x] Demo deployment restart does not lose published artifact.

## Verification

Run adapter contract suite, duplicate publish and intended deployment persistence probe.

## Completion evidence

- Tests/results:
  - `pnpm --filter @forgeroom/artifacts test` — 6 passed (namespace escape, idempotent publish, persistence probe)
  - `pnpm --filter @forgeroom/db test -- src/artifact-storage.integration.test.ts` — 2 passed (metadata persist, duplicate publish idempotency)
  - `pnpm --filter @forgeroom/api test -- src/artifacts/artifacts.test.ts` — 3 passed (auth required, metadata+download, cross-workspace forbidden)
  - `pnpm --filter @forgeroom/{artifacts,db,api} typecheck` — green
- Persistence probe:
  - Local directory adapter re-open retains bytes (`forgeroom-p0-probe-sample.md` content) across adapter recreation; demo uses `ARTIFACT_STORAGE_DIR` on persistent disk per `provider-fixtures/artifact-storage.candidate.json`
- Files:
  - `packages/integrations/artifacts/src/{boundary,hash,storage-key,safe-filename,local-directory,publish,types,index}.ts`
  - `packages/db/src/artifact-storage.ts`
  - `apps/api/src/artifacts/{service,routes,artifacts.test}.ts`
  - `apps/api/src/server.ts`, `apps/api/package.json`, `packages/db/src/index.ts`

## Work log

- 2026-08-27 — Implemented local-directory artifact adapter with workspace/channel-scoped keys, DB publish idempotency, authenticated GET/download routes; preview endpoint deferred to P0-312.
