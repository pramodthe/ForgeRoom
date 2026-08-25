# Startup platform test plan

## Test principles

- Test authoritative commands and invariants before UI projections.
- Use real PostgreSQL/object-store/search behavior for persistence, authorization, concurrency, migration, and replay tests.
- Provider-backed claims require recorded redacted evidence; mocks prove application behavior only.
- Every security boundary has positive, negative, stale/revoked, concurrency, retry/replay, and cross-workspace/channel tests.
- Each release re-runs all earlier release gates.

## Test layers

| Layer | Required coverage |
| --- | --- |
| Schema/unit | Closed schemas, canonical hashes, state transitions, policy decisions, recurrence/filter parsers, redaction, budgets |
| Database | Constraints, CAS on every mutable aggregate root, idempotency, tenancy, RLS defense, event/outbox atomicity, migrations, retention |
| Service integration | API auth, queues/leases, object/search stores, TrueForge/Composio adapters, parsers, scheduler, webhooks |
| Contract | API/event/tool fixtures across supported versions; TrueForge/AG-UI/Composio descriptor compatibility |
| Browser | Critical user journeys, refresh/reconnect, multi-human concurrency, responsive behavior, visual regression |
| Accessibility | Keyboard, screen reader semantics, axe, focus, fallbacks, reduced motion, contrast |
| Security | Isolation, revocation, injection, SSRF, file/package/webhook abuse, authorization, secret leakage, supply chain |
| Recovery | Worker/API/scheduler crash, duplicate delivery, unknown provider outcome, backup/restore, index rebuild, upgrade |
| Load | Reference-workspace latency, event fanout, queues, schedules, knowledge search, record queries, workflow concurrency |

## P0 addition gates

- Coworker Builder exact prompt creates a read-only GitHub/web draft, shows every effective grant/denial, and requires revision-bound confirmation.
- Stale catalogue/policy/account/draft and concurrent confirm fail closed/idempotently.
- TaskRecord CRUD enforces exact channel/coworker permissions, status transitions, optimistic revision, history, source links, and replay.
- P0 regression proves Save-as-skill excludes reasoning/secrets/raw tool bodies, publishes one immutable instruction-only version, attaches within existing authority, and rotates the session; the alpha skill suite then tests invocation/version lineage.
- Controlled table/chart/TaskCard/ArtifactCard/ChoiceForm render with fallback; one filter/choice state survives refresh and cannot approve/resume/call external tools.
- P0 does not register `generate_open_ui`, accept `iframe_v1`, deploy the generated origin, create iframe capabilities, or ambiently enable coordinator/native subagent/component catalogue paths moved to P1.

## Coworker and skill matrix

| Scenario | Expected |
| --- | --- |
| Prompt asks for ungrantable write/account | Draft lists denied request without secret resource disclosure |
| Draft policy/catalogue changes | Confirm returns stale diff; creates nothing |
| Duplicate confirm/retry | One coworker and one provisioning identity |
| Disable/revoke while queued/scheduled | No new TrueForge invocation; affected work visibly blocked |
| Malicious builder text | Remains data; structured schema/server grants hold |
| Skill save from run | Only allowlisted normalized evidence enters draft |
| Skill missing tool/effect | Attach/invoke blocked; no fallback account/tool |
| Skill upgrade/revoke | New runtime revision; historical run retains old hash |
| Malicious imported package | Traversal/symlink/install hook/secret/undeclared executable rejected |

## Connection and external-tool matrix

- OAuth/connect intent binds actor/session/workspace, state/nonce, redirect allowlist, PKCE where supported, expiry and one completion; replay/link confusion creates nothing.
- Two accounts for one application remain isolated across list, preview, grant, compiled runtime, call, approval, audit, reconnect and revoke.
- Catalogue browsing grants nothing; literal descriptor versions/effects and grantor delegation ceiling determine enabled tools.
- Descriptor/schema/effect/policy drift between runtime compile, proposal and call fails closed and stales the proposal.
- Missing scope, expiry, provider outage, identity mismatch and revocation block new work without substituting an account.
- Revocation during an uncertain provider call preserves `unknown` until reconciliation and never blindly retries.
- Events, logs, browser, GenUI, diagnostics, backup/export and model context contain no OAuth code/token, provider credential or raw secret account identifier.

## Knowledge matrix

- Valid PDF/CSV/image/text upload, progress, ready state, refresh, preview, search, and exact page/row/image citation.
- MIME spoof, oversized content, parser/zip bomb, macro/active content, malformed image/PDF, CSV formula, metadata secret, and malware quarantine.
- URL DNS rebinding, redirects, loopback/private/link-local/metadata/non-HTTPS/credential URL, size/time limits, and content-type drift.
- Repository account/repo/ref/path/commit pin, permission revocation, branch movement, symlink/path abuse, binary/secret limits.
- Channel/workspace/source/collection isolation across list, count, search, direct ID, preview, download, citation, cache, notification, and export.
- Deletion/revocation wins over cached index/download capability and propagates to memory/workflow/UI derivatives.

## Memory matrix

- Human-confirmed and coworker-proposed flow for each scope/class.
- Proposal cannot self-confirm; stale source/scope/grant invalidates confirmation.
- Retrieval includes only active/current/authorized/unexpired/uncontested revisions within budgets and records MemoryUse.
- Cross-channel/private/workspace denial through query, semantic similarity, crafted ID, context replay, and “why known.”
- Concurrent edit conflict, revision diff, conflict resolution, expiry, archive/restore, revocation, source deletion, and export/import narrowing.
- Secret/private-reasoning/raw-tool/transient-answer patterns never persist.

## Search and history matrix

- Cross-workspace/private-channel/resource/record-field denial at query, candidate, count/facet, autocomplete, snippet, cursor and open.
- Permission removal, source/record delete, quarantine and tombstone during query/cache/index lag deny from authoritative state.
- Closed query/filter AST, pagination, highlighting and limits reject injection, prototype/HTML/regex/resource exhaustion.
- Snapshot plus event catch-up rebuild under live writes produces verified counts/hashes and atomic profile promotion.
- Search logs/analytics use bounded metadata/query hashes and contain no private query/result bodies by default.
- Run history links safe request/step/tool/approval/record/artifact/skill/receipt lineage and excludes reasoning/raw provider bodies.

## Audit, retention and portability matrix

- Concurrent mutations receive distinct monotonic workspace sequences; rollback leaves no committed event/audit/outbox gap and replay preserves per-aggregate order.
- Audit append/checkpoint/export detects insertion, deletion and reordering, enforces private-resource field visibility and contains no forbidden bodies.
- Every `standard-1` boundary, one-before/one-after expiry, policy revision and legal-hold create/release path is deterministic.
- Source delete/revoke/reclassify denies synchronously across direct ID, search, citation, memory, record, artifact/UI, workflow snapshot, notification and export while purge retries.
- Reverse derivation edges reconcile missing/duplicate/cyclic-safe references; a lag/failure remains denied and operator-visible.
- Portable export/import preserves shipped-domain IDs/revisions/grants/provenance and safe connection metadata, requires reconnection, pauses automation and never broadens visibility.
- Restore of a stale backup cannot resurrect a tombstoned or reclassified resource; primary-store, backup and external-provider retention are reported separately.

## Migration and specification-graph matrix

- Upgrade representative 0.1 fixtures with active/paused/terminal Runs, pending approval, component interrupt, Task, skill, artifact/UI and audit; stable IDs/hashes/permissions/replay remain equivalent.
- Interrupt and resume migration at every checkpoint; dispatch remains fenced until backfill and integrity validation finish.
- Spec validator rejects duplicate/unknown requirement IDs, cross-release ownership, missing index/task/link, cycles, unreachable release gates and optional work leaking into a required gate.

## Record matrix

- Fixed Task and each generic field type validate create/read/update/archive/delete/restore/history.
- Human and coworker/tool commands share command layer but enforce different grant/approval policy.
- A governed record mutation uses the generalized proposal state machine with exact subject/revision/payload binding; forged generic-UI insertion and external-tool resume paths fail.
- CAS/lost-update, idempotent duplicate, transition/field denial, bulk partial/atomic rules, source/provenance, and realtime projection.
- Closed filter AST, limits, deterministic sort, field/row/channel permissions before counts/results.
- Additive/backfill/breaking/destructive schema publication and workflow/skill compatibility.
- CSV import/export formula safety, quotas, per-row failures, relations, attachments, stable IDs, and history.

## Team and notification matrix

- Invitation match, one-use, expiration, revocation, replay, role ceiling, last-owner, transfer, suspend/remove/session closure.
- Private channel undiscoverability across routes, search, events, presence, source refs, notifications, downloads, audit, and generated UI.
- Group/role/resource grant change invalidates cache/capabilities and active event delivery.
- Concurrent edits and approval votes produce one canonical revision/result.
- Notification dedupe, mute/preferences, quiet hours/timezone, safe payload, revoked access before send/open, endpoint verify/revoke, retry/bounce.
- Presence TTL/reconnect/spoof never changes authorization.

## Workflow matrix

- Draft/validate/test/publish/enable/pause/version pin and capability diff.
- Manual, schedule, signed webhook/provider event, record event, and channel command dedupe into one run path.
- Time zones, DST repeated/nonexistent local times, misfire skip/catch-up-one, overlap skip/queue-one, clock/leader failover.
- Signature algorithm, secret rotation, constant-time compare, timestamp/replay window, schema/size, duplicate delivery, payload injection.
- Step lease expiry/crash, bounded retry/backoff, cancellation, wait/approval, budget timeout, dead letter, retry-from-node.
- Every `awaiting_input`/`awaiting_approval`/`retry_wait` exit, compare-and-set wait resolution, duplicate cancel/retry and dead-letter reconcile/dismiss path appends one truthful transition.
- External read/idempotent write/unknown non-idempotent outcome reconciliation; no blind retry.
- Permission/account/skill/schema/source/coworker revocation between steps.
- Cross-channel handoff source/target grants, exact manifest, acceptance, expiry, hop/visited/correlation loop prevention.

## Open-source and operations matrix

- Clean-clone build/test/start on supported platforms with no private ForgeRoom service/key.
- Production-start refusal for dev auth/default secrets/unsafe CORS/missing encryption/pending migrations.
- Backup under active writes, restore to clean deployment, blob/hash/index/event/outbox/approval/schedule validation.
- Upgrade from every supported release fixture, interrupted migration recovery, export before/after upgrade, compatibility fixtures.
- Full export/import with paused connections/triggers/workflows and permission-impact review.
- Telemetry network-silent by default, opt-in preview accuracy, redaction, disable/delete.
- SBOM/license/provenance/signature/vulnerability scan and extension install/upgrade/uninstall/revoke.

## Browser release journeys

### 0.2 private alpha

```text
owner invites member
→ private channel
→ admin connects and grants one exact workspace service account/tool set
→ member uploads PDF and cites it with coworker
→ global search finds the source, Task and prior Run without revealing another private channel
→ coworker proposes scoped memory; owner confirms
→ request creates/updates Task and controlled chart
→ save/test/version skill
→ second member sees authorized realtime state and notification
→ remove member and prove access/realtime/download revocation
→ backup/restore and open identical source/task/memory/skill history
```

### 0.3 team beta

```text
create workflow from successful skill
→ review service principal, sources, records, schedule, approvals, destination
→ test run
→ enable schedule + signed event trigger
→ dedupe duplicate event
→ wait for exact approval
→ verified provider action
→ handoff bounded result to private destination channel
→ notification and complete workflow history
→ revoke connection and prove next run blocks safely
```

### 1.0 GA

Run tenant-isolation, rolling upgrade, HA worker/scheduler failure, large-workspace load, disaster restore, full export, extension signature/revocation, SSO/SCIM where supported, and independent security-review regression journeys.

## Initial performance budgets

Measured on the documented reference deployment and fixture:

- Authenticated non-search reads/mutations: p95 under 500 ms excluding external providers.
- Committed channel/domain event visible to an authorized connected client: p95 under 2 seconds.
- Authorized record query up to 100 rows: p95 under 1 second.
- Knowledge query against 100k segments: p95 under 3 seconds before model generation.
- Due workflow occurrence claimed: p95 under 30 seconds during healthy operation.
- Permission revocation reflected at new requests immediately and active stream/capability boundary within 5 seconds.

Release evidence records hardware, dataset, concurrency, percentile distribution, and error rate; a single screenshot is not evidence.

## Evidence

Each release stores:

- Commands/versions and pass/fail summary.
- Migration/restore fixture hashes.
- Redacted provider/runtime/tool traces.
- Browser screenshots/video and accessibility report.
- Security/tenant matrix and unresolved accepted risks.
- Load/chaos results with environment.
- SBOM/signatures/provenance for release artifacts.
