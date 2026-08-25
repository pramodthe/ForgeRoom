# Files and knowledge specification

## Purpose

Knowledge turns user-provided files, URLs, repositories, and approved external sources into permissioned, citable inputs. An attachment is not automatically memory, a skill, a public artifact, or authority.

## Supported sources

Release 0.2 supports:

- PDF, plain text, Markdown, CSV, JSON, PNG/JPEG/WebP.
- HTTPS URL snapshot with redirect and SSRF controls.
- Repository reference/import with exact provider, account, repository, ref, and path scope.
- Existing application artifacts promoted by an authorized user.

Office documents, audio/video transcription, continuous external sync, and arbitrary archive extraction require later explicit format tasks.

## Objects

| Object | Purpose |
| --- | --- |
| `KnowledgeSource` | Stable identity, owner, type, scope, lifecycle, current version |
| `KnowledgeSourceVersion` | Immutable bytes/snapshot/ref, content hash, media type, size, provenance, freshness |
| `KnowledgeExtraction` | Parser/OCR version, status, safe metadata, text/table/image outputs, warnings |
| `KnowledgeChunk` | Derived bounded segment with source offsets/page/cell/path and content hash |
| `KnowledgeCollection` | Curated set of source versions with its own grants and description |
| `KnowledgeGrant` | Human/coworker/channel/workflow permission to discover, read, quote, or export |
| `Citation` | Exact source version and location supporting a message, memory, record, artifact, or claim |
| `KnowledgeQuery` | Audited query, scopes, filters, index version, result references, freshness |

## Ingestion flow

```text
requested → uploaded/fetched → scanning → extracting → indexing → ready
                  ↘ quarantined      ↘ failed       ↘ failed
ready → superseded | revoked | deleting → deleted/tombstoned
```

1. Authorize source type, destination scope, connection, URL/repository, byte and quota limits before accepting content.
2. Stream bytes to quarantine storage while hashing; declared MIME and filename never determine parser alone.
3. Scan for malware, active content, archive/path abuse, parser bombs, secret patterns, and unsupported encryption.
4. Extract in an isolated worker with no ambient credentials and network off by default.
5. Store immutable extracted structures and source-location mappings; create replaceable search/vector projections.
6. Mark `ready` only after integrity, parser, index, authorization, and citation probes pass.
7. Notify the uploader of partial extraction, unsupported pages/rows, stale remote snapshots, or quarantine.

## Requirements

| ID | Contract | First release |
| --- | --- | --- |
| KN-001 | Upload/fetch validates authenticated workspace, destination scope, source permission, type, size, quota, and idempotency before processing. | 0.2 |
| KN-002 | Original bytes and every derived extraction/chunk bind immutable source version and content hashes. | 0.2 |
| KN-003 | PDF/CSV/image/text/URL/repository ingestion uses isolated bounded parsers; active content never executes in the trusted app. | 0.2 |
| KN-004 | Search indexes are derived projections; discovery and content delivery recheck current source and requester grants. | 0.2 |
| KN-005 | Answers and derived objects cite source version plus useful location such as page, row/cell, line, path/ref, or image region. | 0.2 |
| KN-006 | Coworkers see only explicit source/collection scopes compiled into the current channel/run; no workspace-wide implicit RAG. | 0.2 |
| KN-007 | Revocation/deletion prevents new retrieval immediately and schedules deletion/tombstoning of bytes, chunks, indexes, caches, and derived objects per retention/legal policy. | 0.2 |
| KN-008 | The UI exposes source owner, scope, status, freshness, parser warnings, citations, derivatives, and access history. | 0.2 |
| KN-009 | URL fetches enforce DNS/IP/redirect/content limits and forbid credentials, local/private networks, metadata services, and non-HTTPS targets by default. | 0.2 |
| KN-010 | Repository sources pin provider/account/repository/ref/path and do not broaden when branches or permissions change. | 0.2 |
| KN-011 | Continuous sync creates new immutable source versions, reports conflicts/failures, and never silently changes a workflow's pinned input. | 0.3 |
| KN-012 | Export/restore preserves original bytes where policy allows, versions, hashes, grants, extraction metadata, citations, and deletion state. | 1.0 |

## Query and citation contract

A knowledge query states:

- Requesting human/coworker/workflow and channel.
- Explicit source/collection scopes.
- Query text or structured filters.
- Maximum results/bytes/tokens and freshness threshold.
- Allowed content classes and citation requirement.

Each result carries only authorized excerpt/structure plus `sourceVersionId`, location, content hash, parser/index version, fetched/extracted time, and freshness. The model may summarize it; it may not invent a citation or cite a newer version it did not receive.

“Why does the coworker know this?” opens the exact citations or says the value came from user input, a memory item, a record, a skill, or an uncited model statement.

## Security and privacy

- Uploaded filenames, document text, CSV formulas, image metadata, repository files, and web pages are untrusted.
- CSV/worksheet exports escape formula injection. HTML/script, PDF active actions, embedded files, macros, and SVG are inert or rejected.
- Secrets detected in content are quarantined/redacted according to policy; they are never converted into memory or examples automatically.
- Signed download/preview capabilities are short-lived, actor/resource/scope-bound, and recheck revocation.
- Cross-channel knowledge requires an explicit collection/grant; channel membership alone does not reveal private source names.
- Source deletion cannot retract already seen content from a human, but blocks new retrieval and marks retained derivatives unavailable/contested.

## Failure behavior

- Unsupported/encrypted/corrupt content yields a typed error and preserves no readable projection unless policy retains quarantined bytes.
- Partial extraction records exact missing pages/rows/assets; a coworker cannot present it as complete.
- Index outage falls back to authorized direct metadata/source access where feasible and labels degraded search; it never bypasses grants.
- A source changed at its origin is “stale” until a new version is fetched; the old snapshot remains clearly versioned.
- Parser/index upgrades rebuild projections without mutating source versions or citations.

## Acceptance scenarios

- Upload a PDF, ask a coworker a question, and open a page-specific citation after refresh.
- Upload a CSV containing formulas and malicious HTML; table preview remains inert and exported cells are safe.
- Revoke a private source while it appears in search cache; subsequent query and download are denied and the index entry disappears.
- Redirect a URL fetch toward localhost/cloud metadata; ingestion fails before a request reaches the target.
- Change a repository branch after ingestion; the citation still identifies the exact old commit/ref and a refresh creates a new version.
