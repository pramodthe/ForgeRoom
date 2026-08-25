# Platform security and privacy specification

## Security goals

1. No human, coworker, workflow, trigger, component, skill, file, memory, record, or connection gains authority from content alone.
2. Workspace/channel/resource isolation holds across API, events, search, downloads, previews, notifications, exports, background jobs, and caches.
3. External mutations match the exact reviewed proposal or fail visibly.
4. Untrusted files, webhooks, packages, model output, tool output, and generated UI cannot cross trusted execution boundaries.
5. Revocation takes effect before future retrieval, execution, delivery, interaction, or trigger claim.

The detailed P0 approval, TrueForge, Composio, artifact, and GenUI controls in `../001-forgeroom-foundation/security.md` remain normative. This file adds startup domains and deployments.

## Principals and trust boundaries

Authorization principals are authenticated humans and explicit application service principals. A coworker/runtime acts only through an application-owned identity and grants compiled for its current revision. Models, prompts, skills, webhook senders, files, memory text, record values, GenUI, URLs, and external provider payloads are untrusted data.

Trust boundaries:

- Browser ↔ application API/event gateway.
- API/worker/scheduler ↔ database/object/search stores.
- Application ↔ TrueForge.
- TrueForge ↔ Daytona/Composio/model providers.
- Ingestion workers ↔ untrusted files/URLs/repositories.
- Trigger ingress ↔ public networks/providers.
- Extension packages ↔ installer/runtime/browser.
- Hosted control plane ↔ tenant data planes where applicable.

## Platform requirements

| ID | Contract | First release |
| --- | --- | --- |
| PSEC-001 | Every query/command/stream/search/download/preview/notification/export/background step uses centralized default-deny resource authorization. | 0.2 |
| PSEC-002 | Effective authority intersects active identity/membership, scoped role/group, resource/channel grant, coworker/workflow revision, connection delegation, and current policy/security state. | 0.2 |
| PSEC-003 | Tenant/resource identifiers supplied by clients/events/models are selectors only; server-held relationships establish ownership and scope. | 0.2 |
| PSEC-004 | PostgreSQL roles and row-level security provide defense in depth for hosted/team tables; migration, API, worker, and read-only operator roles are separated. | 0.2 |
| PSEC-005 | Sensitive content and credentials use encryption/secret-manager references, key versioning, least-privilege service access, redacted logs, and tested rotation. | 0.2 |
| PSEC-006 | Upload/URL/repository ingestion is isolated, bounded, malware/active-content/SSRF/path checked, and excluded from policy/instruction/memory promotion by default. | 0.2 |
| PSEC-007 | Webhook ingress verifies endpoint, signature/secret, timestamp/replay window, size/schema, event allowlist, and dedupe before domain event/run creation. | 0.3 |
| PSEC-008 | Skill/extension import validates package paths, integrity, publisher/license, permissions, executable content, compatibility, and secrets before disabled installation. | 0.2 |
| PSEC-009 | Memory/knowledge/search retrieval authorizes before result assembly and again before content delivery; cached IDs/excerpts grant nothing. | 0.2 |
| PSEC-010 | Revocation invalidates sessions/capabilities/caches and blocks new runs, workflow steps, triggers, downloads, interactions, and notification delivery promptly. | 0.2 |
| PSEC-011 | CSRF, session fixation, clickjacking, XSS, open redirect, SSRF, injection, prototype pollution, unsafe deserialization, and formula injection have explicit tests at relevant surfaces. | 0.2 |
| PSEC-012 | Audit/security events are append-only, content-minimized, access-controlled, retention-governed, integrity-verifiable, and exportable. | 0.2 |
| PSEC-013 | Official releases have dependency/secret/container/code scanning, locked dependencies, SBOM, signed provenance, vulnerability response, and supported-version policy. | 1.0 |

## Data classification

Closed classes are `public`, `workspace_internal`, `confidential`, `restricted`, and `secret_credential`. Classification propagates through source versions, chunks, memory, records, artifacts, workflow snapshots, UI data, exports, and audit payload choices. Every content revision carries its policy/provenance hash and every derivative registers a reverse dependency edge. Derived data takes the maximum source class unless an authorized deterministic redaction/declassification policy proves a lower class. [`retention.md`](./retention.md) defines the storage fields, defaults and propagation contract.

`secret_credential` may be entered only through a trusted secret/auth flow and is never delivered to the model, chat, memory, knowledge, record, artifact, GenUI, audit body, or export payload.

## Authentication and sessions

- Production uses OIDC/OAuth or documented local identity with verified passwords/MFA policy; development bypass is bound to local/dev mode.
- Sessions are server-validated, secure/HttpOnly/SameSite cookies or equivalent, rotated on authentication/privilege change, bounded by idle/absolute expiry, and revocable per user/workspace.
- Recent authentication is required for ownership transfer, destructive export/delete, secret/connection changes, high-impact policy, and other configured operations.
- SSE/WebSocket/event connections reauthorize at connect and on permission revision/reconnect; resource revocation closes or filters active streams.

## Service principals and background work

- Schedules/webhooks do not borrow the last human's session.
- Every immutable workflow version pins one named service principal with explicit resource/tool limits and owner. Triggers cannot override it; each run copies it from the exact version and rechecks current principal, grant and policy state before claim and consequential steps.
- Trigger payload fields cannot select principal, tool, account, destination channel, approval policy, or arbitrary URL.
- Worker jobs carry signed/internal references or server-resolved IDs, not browser/model claims.
- Scheduler/worker admin endpoints are private/authenticated and cannot execute arbitrary serialized jobs.

## Privacy and retention

- Each domain follows the explicit `standard-1` defaults and override rules in `retention.md`, including deletion, export, source revocation and unavoidable external-provider retention.
- Telemetry/analytics exclude message/file/memory/tool bodies by default and are opt-in for self-host.
- Support access is time-bounded, approved, audited, least privilege, and absent in self-host unless enabled by the operator.
- Legal hold prevents physical deletion but does not restore product visibility or active retrieval.
- Backups follow deletion/retention windows and are encrypted; restore replays deletion/tombstone state before normal availability.

## Incident classes

Security incident types include cross-tenant/resource disclosure, unauthorized provider action, approval mismatch, secret exposure, malicious package/file escape, webhook forgery/replay, audit tampering, signing-key compromise, and backup disclosure. Each has containment runbook, affected-resource query, credential/key rotation path, provider reconciliation, user notification decision, evidence preservation, and regression test.

## Acceptance scenarios

- Crafted IDs, search terms, event replay, download URLs, notifications, and exports cannot reveal a private channel/source/record/memory.
- Remove a user or revoke a coworker/workflow grant while sessions and streams are active; every later boundary denies promptly.
- A malicious PDF/CSV/repository/skill/webhook attempts code execution, SSRF, path traversal, formula injection, secret exfiltration, or policy injection and remains contained.
- A workflow trigger tries to choose a different account/channel/tool through payload data; the server ignores/rejects it.
- Restore an old backup after a user/source deletion; tombstone replay prevents the deleted content from becoming active.
