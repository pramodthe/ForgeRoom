# Durable memory specification

## Purpose

Memory is reviewable, scoped, source-linked context deliberately retained beyond a run. A transcript, channel summary, pin, knowledge source, record, or model context cache is not automatically memory.

## Memory classes and scopes

| Class | Example | Typical scope |
| --- | --- | --- |
| Preference | “Use concise weekly summaries.” | user↔coworker |
| Stable fact | “Customer Alpha's renewal owner is Sam.” | channel or workspace, source required |
| Decision | “Use provider X for the beta.” | channel/project record |
| Constraint | “Never contact customers without approval.” | coworker policy; also belongs in standing instructions |
| Relationship/context | “Project Phoenix serves the support team.” | channel/workspace |

Allowed scopes are `user_private`, `user_coworker`, `channel`, `coworker`, `record`, and `workspace`. Workspace scope is opt-in and restricted; cross-workspace scope does not exist.

## Objects

| Object | Purpose |
| --- | --- |
| `MemoryProposal` | Suggested content/scope/source/expiry before a trusted decision |
| `MemoryItem` | Stable identity, scope, class, status, current revision |
| `MemoryRevision` | Immutable canonical statement, source references, confidence, validity window, actor, change reason |
| `MemoryGrant` | Who/coworker/workflow may discover, use, propose, edit, or delete |
| `MemoryUse` | Run/response retrieval record with query, revision, source, and influence summary |
| `MemoryConflict` | Explicit relationship between inconsistent active/revoked/contested claims |

## Write flow

```text
suggested → awaiting_review → active
    ↘ rejected                ↘ superseded | expired | contested | revoked
```

1. A human or granted coworker proposes a concise candidate with scope, class, sources, confidence, reason to remember, owner, expiry/review date, and affected coworkers/channels.
2. Policy determines whether explicit review is mandatory. Release 0.2 requires review for workspace memory, facts about people/customers, safety constraints, and any memory proposed from external data.
3. Trusted UI shows the candidate and its exact retrieval scope. Confirmation binds proposal revision and current source/grant status.
4. The server stores an immutable revision and updates the active pointer; the proposing model cannot confirm itself.
5. Corrections create a new revision or a contested relationship; history and prior uses remain visible.

## Retrieval flow

```text
run context request
→ authorize actor/coworker/channel/record scopes
→ filter active + valid + fresh items
→ rank within byte/token/item budget
→ recheck sources/grants
→ deliver compact statement + source IDs + revision
→ record MemoryUse
```

Memory is advisory context, not authoritative mutable business data. Current values should be reopened from records or external sources for consequential decisions.

## Requirements

| ID | Contract | First release |
| --- | --- | --- |
| MEM-001 | `MemoryItem` is distinct from transcript, summary, pin, knowledge, record, prompt, and provider cache. | 0.2 |
| MEM-002 | Every active memory has class, owner, exact scope, canonical statement, source/provenance, revision, validity/expiry, and review policy. | 0.2 |
| MEM-003 | Coworker proposals cannot self-approve; protected scopes/classes require an authorized human decision in trusted UI. | 0.2 |
| MEM-004 | Users can inspect “why known,” source, uses, scope, revisions, conflicts, freshness, and affected coworkers; they can correct, revoke, expire, or delete subject to retention. | 0.2 |
| MEM-005 | Retrieval rechecks current membership, grants, status, validity, source revocation, and bounded context budget at use time. | 0.2 |
| MEM-006 | Cross-channel/workspace retrieval is disabled by default and requires explicit memory scope plus coworker/run authorization. | 0.2 |
| MEM-007 | A correction never silently erases history; future runs use the current uncontested revision and historical runs retain exact references. | 0.2 |
| MEM-008 | Sensitive values, credentials, tokens, private reasoning, raw tool bodies, and transient answers are never stored as memory. | 0.2 |
| MEM-009 | Source deletion/revocation marks dependent memory unavailable or contested before future retrieval and schedules policy-defined derivative handling. | 0.2 |
| MEM-010 | Team policy supports approval class, expiry defaults, maximum scope, protected subjects, retention, and cross-channel access. | 0.3 |
| MEM-011 | Import/export preserves revision/source/scope/grant/use metadata and cannot broaden visibility in the destination. | 1.0 |

## Conflict and freshness rules

- Exact duplicates merge only as new supporting sources on a reviewed revision.
- Contradictory facts create `MemoryConflict`; no model-selected winner becomes canonical without configured authoritative source or human review.
- Time-sensitive facts require `validUntil` or a source freshness threshold.
- Preferences may be overridden at narrower scope; retrieval exposes both rule and winning scope.
- Safety/approval constraints in memory cannot replace policy or coworker instructions. The strictest applicable server policy wins.

## Privacy and deletion

- User-private memory is never delivered to another human/coworker/workflow unless the user explicitly reshares it.
- Membership removal immediately blocks retrieval and memory-management queries outside retained audit rights.
- Delete removes discoverable content and derived indexes according to policy; audit may retain content-free identifiers/hashes/decision metadata.
- Legal hold may block physical deletion but does not keep a revoked item active for retrieval.
- Memory text is encrypted at rest where supported and excluded from general analytics/telemetry.

## UX

The Memory page provides scope filters, sources, last used, freshness, conflicts, expiry, revision history, and bulk review. Every coworker profile has a filtered view. A response can show a small source chip: **Memory: preferred report format**, opening the exact item and its source.

## Acceptance scenarios

- A coworker proposes a stable preference; a human narrows it to one channel, confirms, and a later run uses and cites the revision.
- A private-channel fact is not discoverable by a coworker in a public channel even if semantic search ranks it highly.
- A source record changes; the old memory becomes contested/stale and is not presented as current.
- Deleting an active memory removes it from subsequent run context while historical audit says which deleted revision influenced an old output without exposing deleted text.
- A prompt asks the coworker to “remember my API key”; the proposal is rejected and no secret appears in memory storage or events.
