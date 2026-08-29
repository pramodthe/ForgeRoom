---
id: P0-312
title: Implement artifact extraction and safe preview
status: done
owner: cursor-agent
started: 2026-08-27
completed: 2026-08-27
depends_on: [P0-310, P0-311]
requirements: [SB-003, SB-004, SB-005, GUI-006]
specs: [../runtime.md#sandbox-and-artifact-handoff, ../ux.md#work-panel]
adrs: [ADR-005, ADR-007]
touches: [packages/integrations/artifacts, apps/api, packages/contracts, packages/orchestration, apps/worker]
---

# P0-312 — Implement artifact extraction and safe preview

## Outcome

Validated TrueForge sandbox files become durable, source-linked artifacts with non-executable previews.

## Acceptance criteria

- [x] Artifact metadata is read from expected assistant event and sandbox turn.
- [x] Path, size and allowed MIME are validated before download; nominated filenames, downloaded bytes and bounded ZIP entries are screened for credentials and raw tool payloads before storage.
- [x] File is hashed and copied into immutable storage revision.
- [x] Artifact remains after sandbox teardown.
- [x] HTML/script cannot execute in preview.
- [x] Download/preview requires channel authorization.
- [x] Image artifacts record dimensions/alt-text status, enforce encoded-byte/decoded-pixel/decompression limits, strip metadata, re-encode authenticated raster input as PNG/WebP, and reject SVG, HTML and polyglots before ImageCard use.
- [x] Rich UI receives only artifact ID/revision/metadata, never sandbox path or arbitrary remote URL.

## Verification

Run happy path, traversal, oversized, bad MIME, active HTML, teardown and unauthorized access tests.

## Completion evidence

- Tests/results:
  - `pnpm --filter @forgeroom/artifacts test` — 19 passed (canonical discovery, path traversal, MIME/size validation, download-only formats, safe preview, HTML/SVG rejection, image processor hook)
  - `pnpm --filter @forgeroom/orchestration test -- src/artifact-extraction.test.ts` — 5 passed (publish path, sandbox-not-ready, worker command binding, teardown download failure)
  - `pnpm --filter @forgeroom/api test -- src/artifacts/artifacts.test.ts` — 3 passed (auth required, metadata+download+preview CSP, cross-workspace forbidden)
  - `pnpm --filter @forgeroom/{artifacts,orchestration,api,contracts,worker} typecheck` — green
- Sample safe artifact path:
  - TrueForge `model.message` fenced `sandbox_artifacts` block → `artifact.discovered` → TrueForge `download-sandbox-file` → validated hash → `artifact.published` + `forgeroom.artifact.v1`
  - Preview: `GET /api/artifacts/:id/preview` returns JSON text preview or re-encoded PNG/WebP bytes with `Content-Security-Policy: script-src 'none'`
  - Worker: `publish_sandbox_artifact` command executes idempotent CAS publish via `executePublishSandboxArtifact`
- Files:
  - `packages/integrations/artifacts/src/{extraction-p0-contract,discovery,sandbox-path,validate-download,preview,preview-sharp,extraction.test}.ts`
  - `packages/orchestration/src/{artifact-extraction,artifact-extraction.test}.ts`
  - `apps/api/src/artifacts/{service,routes,artifacts.test}.ts`
  - `apps/worker/src/index.ts`
  - `packages/contracts/src/artifacts.ts`

## Work log

- 2026-08-27 — Implemented TrueForge canonical `sandbox_artifacts` discovery, pre-download validation, durable publication orchestration, safe preview endpoint, and worker `publish_sandbox_artifact` wiring. Live TrueForge end-to-end retain probe remains blocked on OpenAI billing (same as P0-311).
