---
id: P0-312
title: Implement artifact extraction and safe preview
status: blocked
owner: unassigned
depends_on: [P0-310, P0-311]
requirements: [SB-003, SB-004, SB-005, GUI-006]
specs: [../runtime.md#sandbox-and-artifact-handoff, ../ux.md#work-panel]
adrs: [ADR-005, ADR-007]
touches: [packages/integrations/artifacts, apps/api, packages/contracts]
---

# P0-312 — Implement artifact extraction and safe preview

## Outcome

Validated TrueForge sandbox files become durable, source-linked artifacts with non-executable previews.

## Acceptance criteria

- [ ] Artifact metadata is read from expected assistant event and sandbox turn.
- [ ] Path, size and allowed MIME are validated before download.
- [ ] File is hashed and copied into immutable storage revision.
- [ ] Artifact remains after sandbox teardown.
- [ ] HTML/script cannot execute in preview.
- [ ] Download/preview requires channel authorization.
- [ ] Image artifacts record dimensions/alt-text status, enforce encoded-byte/decoded-pixel/decompression limits, strip metadata, re-encode authenticated raster input as PNG/WebP, and reject SVG, HTML and polyglots before ImageCard use.
- [ ] Rich UI receives only artifact ID/revision/metadata, never sandbox path or arbitrary remote URL.

## Verification

Run happy path, traversal, oversized, bad MIME, active HTML, teardown and unauthorized access tests.

## Completion evidence

- Tests/results:
- Sample safe artifact path:
