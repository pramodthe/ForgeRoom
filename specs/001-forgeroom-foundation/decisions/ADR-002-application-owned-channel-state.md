# ADR-002 — Application-owned canonical channel state

| Field | Value |
| --- | --- |
| Status | accepted |
| Date | 2026-08-25 |
| Deciders | Product and data architecture review |

## Context

Separate TrueForge sessions do not share one canonical transcript, memory, permissions, artifacts or Run graph. The browser also requires stable replay independent of provider event formats.

## Decision

PostgreSQL is authoritative for channels, messages, monotonic channel events, Runs, RunSteps, grants, context pins, PauseGroups, artifacts and application audit history. TrueForge events are normalized before browser delivery.

## Consequences

- Browser reconnect uses application channel sequence.
- Cross-session collaboration has explicit bounded context.
- Provider payload changes are isolated in adapters.
- The application must maintain event normalization and deduplication.
- Application audit is declared lineage, not provider or cryptographic proof.

## Rejected alternatives

- Treat TrueForge transcript as the channel: no cross-session canonical ordering or product-level authorization.
- Let browser combine provider streams: exposes credentials and creates inconsistent state.
- Copy full history into every turn: unbounded context and cross-channel leakage risk.

## Verification

- Transactional monotonic sequence test.
- SSE replay test from Last-Event-ID.
- Cross-channel context exclusion test.
- Browser imports normalized event contract only.
