---
id: P1-402
title: Implement operator health, observability and opt-in telemetry
status: blocked
owner: unassigned
depends_on: [P1-101, P1-401]
requirements: [OSS-003, PSEC-005, PSEC-010, PSEC-011]
specs: [../open-source.md, ../security.md, ../architecture.md]
release_gate: required
---

# P1-402 — Implement operations and telemetry

## Outcome

Self-hosters can diagnose queue, storage, provider, ingestion and projection health without exposing user content or being forced to send telemetry.

## Acceptance criteria

- [ ] Readiness/liveness and operator dashboard distinguish database, object store, worker, outbox, search, TrueForge, Composio and Daytona state.
- [ ] Structured logs/traces use safe correlation IDs, bounded metadata and central redaction; prompts, files, credentials and raw tool bodies are excluded.
- [ ] Metrics cover queue age, failures, retries, storage/index reconciliation, provider latency, notifications and backup age.
- [ ] Self-host telemetry is off by default, has a documented schema/endpoint and explicit opt-in/out verification.
- [ ] Diagnostics bundle is locally generated, previewable and redacted before export.
- [ ] Alerts link to recovery steps and cannot leak private content in notification text.

## Verification

Run component-failure drills, redaction canaries, telemetry-off packet inspection, diagnostics scan and alert deduplication tests.

## Evidence

- Health screenshots:
- Redaction/packet report:
- Failure drill:
