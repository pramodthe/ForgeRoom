---
id: P1-201
title: Implement secure file, URL and repository knowledge ingestion
status: blocked
owner: unassigned
depends_on: [P1-000, P1-101, P1-102]
requirements: [KN-001, KN-002, KN-003, KN-009, KN-010, PSEC-006]
specs: [../knowledge.md, ../data-model.md, ../contracts/api.md, ../security.md]
release_gate: required
---

# P1-201 — Implement knowledge ingestion

## Outcome

Authorized users can ingest supported files, URLs and repositories into isolated, inspectable source revisions without making untrusted content executable.

## Acceptance criteria

- [ ] PDF, CSV, image and text uploads use staged scanning, MIME/content validation, size limits and content-addressed storage.
- [ ] Multipart ingress binds actor/upload/part number/size/hash/state/idempotency and final ordered manifest/hash; replay, abort, expiry and mismatch leave no source or reusable staging capability.
- [ ] URL and repository sources record canonical origin, fetched revision/commit, fetch time and redirect/egress policy.
- [ ] Parser/OCR jobs run under narrow service principals with time/CPU/byte limits and no workspace credentials.
- [ ] Parser/OCR/index upgrades create immutable versioned `KnowledgeExtraction` outputs/warnings/segments and CAS-promote a validated head without rewriting old citations.
- [ ] Source/revision/chunk states are explicit; partial or failed ingest never becomes searchable as complete.
- [ ] Duplicate bytes/revisions are idempotent within allowed scope and never cross tenant boundaries.
- [ ] Delete/retention propagates to chunks, search indexes, previews and future retrieval while preserving required tombstones/audit.

## Verification

Run the format corpus, MIME polyglots, archive bombs, malicious documents, SSRF/redirects, repo size, timeout, duplicate and deletion tests.

## Evidence

- Supported corpus/results:
- Security report:
- Storage/index reconciliation:
