# ADR-001 — One TrueForge session per channel and persistent coworker

| Field | Value |
| --- | --- |
| Status | accepted |
| Date | 2026-08-25 |
| Deciders | Product and runtime architecture review |

## Context

A TrueForge session is bound to one agent definition and permits one active turn. Starting another turn in a busy session cancels the active turn. Persistent named coworkers require independent roles, grants, history and concurrent execution.

## Decision

Create one immutable TrueForge session generation for every `(channel, persistent coworker)` pair. Coordinate persistent coworkers through application-owned Runs and context envelopes. P0 compiles TrueForge native subagents off; P1 may enable temporary child threads inside one persistent coworker's turn after lineage/security/UI mapping ships.

## Consequences

- Persistent coworkers can run concurrently.
- Grants and identity remain separately auditable.
- Shared channel context must be assembled by the application.
- Profile or permission changes require session rotation.
- More sessions increase provisioning and context-management work.

## Rejected alternatives

- One session for the whole channel: loses concurrency and stable permission identity.
- Model-authored personas inside one session: not enforceable as separate principals.
- Native subagents as channel members: temporary, inherit parent tools and lack durable channel identity.

## Verification

- Database unique current generation per channel/coworker.
- Integration test shows two coworkers receive different TrueForge session IDs and run concurrently.
- P0 manifest test proves native subagents are disabled; P1 mapping tests keep enabled native child threads nested and absent from roster.
