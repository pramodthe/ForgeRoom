# Retention, deletion, export and classification specification

## Purpose

Retention is a workspace policy enforced across authoritative rows, blobs, indexes, caches, exports, backups and external-service disclosures. Deleting a source must stop future visibility/use immediately even when physical erasure is asynchronous. Legal hold may preserve bytes but never restores product authority or discoverability.

## Shipped `standard-1` defaults

Workspace owners may shorten these values where dependencies allow. Longer values require an explicit policy revision and disclosure. Self-host operators may configure storage-level backup expiry, but the product reports drift from the selected profile.

| Data class | Active default | After explicit delete (archive remains restorable) | Backup maximum | Derived propagation |
| --- | --- | --- | --- | --- |
| Channels, messages, records, skills, memories and user-owned knowledge | Until explicit deletion or workspace deletion | Hidden immediately; recoverable tombstone 30 days, then content purge | 35 days after purge | Deny search/retrieval immediately; tombstone dependent projections and re-evaluate memory/workflow eligibility |
| Runs, normalized events, approvals, receipts and workflow history | 365 days after terminal by default | Content-minimized lineage may remain for audit; payloads purge on policy | 35 days after purge | Remove bodies/snapshots; retain non-secret IDs, hashes, outcomes and policy references when audit requires |
| Artifacts and controlled UI snapshots | Parent Run/channel retention, unless separately retained | Download/render denied immediately; blob purge within 30 days | 35 days after purge | Revoke capabilities; remove previews/indexes; keep content-free lineage |
| Notifications | Unread 90 days; read/archived 30 days | Purge body/link projection; retain delivery outcome in audit minimum | 35 days | Cancel unsent delivery and delete safe previews |
| Presence/typing leases | 60 seconds | Immediate expiry | Not backed up | None |
| Upload/assembly staging | 24 hours; iframe partial staging 15 minutes | Immediate deletion on success/failure/cancel | Not backed up | No projection may depend on staging bytes |
| Quarantined uploads/packages | 7 days for owner/operator review | Immediate deny; purge at expiry unless legal hold | 35 days if backed up by deployment policy | No search/model/memory/preview eligibility |
| Search/vector/cache projections | While authoritative source is eligible | Tombstone synchronously; physical purge/rebuild within 24 hours | Rebuildable; excluded from portable backup by default | Reauthorization always wins over stale candidates |
| Operational logs/traces | 30 days | Purge automatically | 35 days | Bodies, credentials, model reasoning and raw provider payloads are never eligible |
| Audit minimum and integrity checkpoints | 365 days, or longer explicit workspace/legal policy | Content-minimized and access-restricted; no product visibility | 35 days after policy expiry | Retain actor/resource/event IDs, time, decision/outcome and hashes; not deleted content bodies |
| OAuth/provider credentials | Provider/secret-manager lifecycle only | Revoke immediately; ForgeRoom stores no credential copy | Per configured secret manager | Remove grants/sessions; disclose provider retention separately |

Changing a default is a versioned policy mutation. It applies prospectively and schedules eligible old data; it does not resurrect purged content or silently shorten an active legal hold.

## Classification and derivation graph

Closed classifications are `public < workspace_internal < confidential < restricted < secret_credential`. Each content-bearing authoritative revision stores `classification`, `classification_policy_revision`, and a `classification_provenance_sha256`. Derived objects store their maximum input class and explicit source edges. Only a reviewed deterministic redaction/declassification profile may lower a class; its profile/version/evidence are retained.

```text
source/message/record/memory revision
→ segment/index/cache
→ run input/output/artifact/UI snapshot
→ memory proposal/record revision/workflow snapshot/export
```

`resource_derivation_edges` provides the reverse dependency graph used by revoke/delete/classification changes. Each root revision also has a versioned derivation manifest/epoch that is sealed even when the expected edge count is zero. Derivative pointer, edge and manifest high-water commit atomically. Missing/building/stale/count-mismatched manifests fail closed for retrieval/export/execution and raise reconciliation work; they never permit a stale derivative.

Classification assignments are append-only and CAS-headed. Reclassification either appends a superseding assignment for the same immutable bytes or creates a new content revision; it synchronously advances the graph/security epoch before any subsequent delivery can use the lower/old class.

## Delete and export flow

1. Authorize and bind exact resource revision, policy revision and idempotency key.
2. Commit product tombstone, permission revision, audit entry, domain event and deletion work in one transaction.
3. Immediately deny discovery, retrieval, download, render, workflow use and capability redemption.
4. Traverse derivation edges and tombstone/reclassify dependent indexes, memory, artifacts, UI data and workflow snapshots.
5. Purge eligible content from primary blobs/stores, then allow backup expiry to complete; record only content-free evidence.
6. Export includes all requester-authorized data in the shipped workspace contract—whether human-, coworker-, or application-owned—plus permitted history and deletion/legal-hold metadata. It never includes credentials, data outside the requester's export authority, or historical bodies forbidden by retention policy.

Portable 0.2 snapshots preserve all data shipped in 0.2, stable IDs, revisions, grants, provenance and safe connection metadata when importing into the same supported release line. The 1.0 contract adds supported cross-version/LTS compatibility; alpha portability is not that promise.

## Requirements

| ID | Contract | First release |
| --- | --- | --- |
| RET-001 | Every content domain maps to a versioned retention profile covering active, delete, backup, audit, legal-hold, export and external-retention behavior. | 0.2 |
| RET-002 | Delete/revoke denies new discovery/use synchronously and durably queues idempotent propagation across rows, blobs, indexes, caches and capabilities. | 0.2 |
| RET-003 | Content revisions carry closed classification plus policy/provenance; derivatives take the maximum input class unless reviewed declassification proves otherwise. | 0.2 |
| RET-004 | A durable reverse derivation graph links sources to chunks, runs, artifacts, UI snapshots, memory, records, workflow inputs and exports. | 0.2 |
| RET-005 | Legal hold is separately authorized, audited and time/reason scoped; it preserves bytes without restoring visibility, retrieval or execution. | 0.2 |
| RET-006 | Portable export/import preserves the complete shipped-release data contract without credentials or visibility broadening. | 0.2 |
| RET-007 | Purge/reconciliation exposes safe status and content-free evidence; partial failures retry and remain denied. | 0.2 |
| RET-008 | External provider/model/TrueForge/Composio/object/notification retention is disclosed independently and never overstated as controlled deletion. | 0.2 |
| RET-009 | Team policy may set class/domain minima/maxima and protected hold roles without letting a narrower scope weaken mandatory policy. | 0.3 |
| RET-010 | 1.0 publishes cross-version export/import, backup expiry and deletion compatibility guarantees for supported releases. | 1.0 |

## Acceptance scenarios

- Delete a private PDF while its segment is cached, cited by memory and referenced by a pending workflow; every new access/use denies before asynchronous purge.
- Put a record under legal hold and remove the user's channel access; bytes remain retained while search, direct-ID and export access still deny.
- Reclassify a source from confidential to restricted; dependent artifact/UI/export eligibility raises to restricted before delivery.
- Restore a backup containing an already-tombstoned source; replayed tombstone/policy state wins and the source never becomes visible.
