# Workspace search and history specification

## Purpose

Channels are the collaboration surface, but a real workspace must let authorized humans find durable work after it scrolls away. Search is a derived, permission-filtered projection over authoritative objects; it never becomes a side door around channel/resource authorization and never treats vector similarity as access.

## Searchable domains

Release 0.2 indexes safe projections for:

- Channels and authorized message text.
- Tasks/records and allowed fields.
- Coworkers and their visible profiles.
- Knowledge sources, filenames/titles and authorized extracted text.
- Skills and visible manifest metadata.
- Memories and sources visible to the querying human.
- Runs/RunSteps, artifacts and safe receipt metadata.

Release 0.3 adds workflows, trigger/run history, handoffs, notifications/approval references and dead-letter metadata. Audit/security events remain in a separate privileged query surface and are not general-search documents.

## Query contract

`WorkspaceSearchQueryV1` is a closed server-parsed structure:

```ts
type WorkspaceSearchQueryV1 = {
  text?: string;
  kinds?: Array<"channel" | "message" | "record" | "coworker" | "knowledge" | "skill" | "memory" | "run" | "artifact" | "workflow" | "trigger" | "handoff" | "notification" | "approval" | "dead_letter">;
  channelIds?: string[];
  ownerIds?: string[];
  states?: string[];
  createdAfter?: string;
  createdBefore?: string;
  sort: "relevance" | "newest" | "oldest";
  cursor?: string;
};
```

The server resolves/filter-allowlists values and computes allowed search scopes from current membership/resource grants. It never trusts client/coworker-supplied workspace, private channel, index, vector, field or ACL filters.

## Requirements

| ID | Contract | First release |
| --- | --- | --- |
| SRCH-001 | Authorized members can search supported workspace objects from one global surface and receive typed result cards with canonical links. | 0.2 |
| SRCH-002 | Query, candidate retrieval, counts/facets, ranking, snippets and result opening enforce current workspace/channel/resource/field authorization without revealing hidden existence. | 0.2 |
| SRCH-003 | Search indexes are derived, versioned and rebuildable; authoritative database/object state wins over stale index data. | 0.2 |
| SRCH-004 | Revocation, deletion, quarantine and permission change prevent new results/snippets promptly and invalidate cached result capabilities. | 0.2 |
| SRCH-005 | Snippets/citations identify exact resource revision/source location/freshness; unavailable content degrades visibly rather than silently opening a newer revision. | 0.2 |
| SRCH-006 | Closed filters, deterministic pagination, bounded queries and safe highlighting resist injection, regex/resource exhaustion and prototype/HTML abuse. | 0.2 |
| SRCH-007 | Search analytics/logs contain bounded query hashes/metadata by default, not private query/result bodies; self-host telemetry remains off. | 0.2 |
| SRCH-008 | Run history search links request, coworkers, steps, tools, approvals, records, artifacts, skills and receipt without exposing raw provider payload or reasoning. | 0.2 |
| SRCH-009 | Workflow, trigger, handoff, notification, approval-reference and dead-letter history becomes searchable in 0.3 under its exact source/destination/workflow/recipient permissions. | 0.3 |

## Index and authorization model

- Each search document stores workspace, resource kind/ID/revision, home scope, classification, allowed safe field keys, content/projection hash, index profile and tombstone/permission revision—not a portable ACL grant.
- Candidate retrieval is constrained by server-derived accessible scopes where supported; every candidate is reauthorized before count, snippet and delivery.
- Vector/full-text ranking may use only authorized candidates. Cross-tenant/shared embeddings cannot return source content without the same reauthorization.
- Result counts/facets are computed after authorization or use privacy-safe bounded approximations explicitly labelled; no hidden private-channel count leakage.
- Opening a result resolves the canonical object through its ordinary API. A search result/cursor/URL never grants access.

## Failure and recovery

- Index outage shows search unavailable/degraded and does not fall back to an unbounded database scan.
- Lag is visible through indexed-at/source-revision state; consequential source answers still use current knowledge retrieval rules.
- Rebuild uses a fixed high-water snapshot plus event catch-up, verifies counts/hashes, then atomically promotes the new index profile.
- Poison documents quarantine one projection and surface operator remediation without blocking unrelated indexing.
- Deleted/revoked objects are denied from current authoritative state even if index cleanup or cache invalidation is delayed.

## UX

Global search opens by keyboard, preserves query/filter state, groups typed results and supports list/screen-reader navigation. Results show kind, title, safe snippet, channel/scope, author/owner, time, freshness/status and source/provenance badges. Empty, no-access, indexing, stale, offline and unsupported-version states are distinct. Search never suggests inaccessible names in autocomplete.

## Acceptance scenarios

- A member searches a phrase present only in a private channel and sees neither result, snippet, facet/count nor autocomplete hint.
- Removing channel access while results are open prevents refresh/open and closes any live result stream.
- A record field denied to the user contributes neither matching, snippet nor highlight.
- A deleted source remains absent while its index deletion is delayed.
- Rebuild during live writes yields the same authorized logical results after catch-up as a clean current index.
- Search finds an old Run and links its Task, skill version, artifact, approval and safe receipt without exposing model reasoning/raw tool bodies.
