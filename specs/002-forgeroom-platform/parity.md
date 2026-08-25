# Competitive parity evidence matrix

## Purpose and snapshot

This is a claim-control document, not a feature-copying plan. It records the non-computer-use product capabilities publicly associated with Kylon, Grok Bot and OpenBot, maps ForgeRoom requirements to them, and prevents the team from saying “parity” before implementation evidence exists.

Comparator snapshot: **2026-08-25**.

Primary public sources:

- **K:** [Kylon — What is Kylon?](https://kylon.io/what-is-kylon)
- **G1:** [Grok Bot — Bots](https://docs.x.ai/grok-bot/bots)
- **G2:** [Grok Bot — Skills, routines and automations](https://docs.x.ai/grok-bot/skills-routines-and-automations)
- **O1:** [OpenBot README](https://github.com/CopilotKit/openbot)
- **O2:** [OpenBot architecture](https://github.com/CopilotKit/openbot/blob/main/docs/architecture.md)

`D` means the cited public source documents a materially related capability. `P` means it documents only part of the row or product behavior needs verification. `—` means this matrix makes no source-backed claim. Competitor behavior may change; update the snapshot and links before a public comparison.

## Target matrix

| Capability | Kylon | Grok Bot | OpenBot | ForgeRoom contract | First claimable release | Required evidence | Current status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Persistent named AI coworkers in shared channels | D (K) | D (G1) | D (O1/O2) | Channels, profiles, separate TrueForge sessions, membership and attribution | 0.1 | P0 browser E2E and runtime receipts | Specified; unimplemented |
| Conversational coworker creation with exact permission review | P (K) | D (G1) | P (O1/O2) | CW-001–CW-007 / AG-010–AG-012 | 0.1 | Golden prompt, overgrant/stale/idempotency tests, live manifest hash | Specified; unimplemented |
| Concurrent multi-coworker work with visible activity | D (K) | P (G1) | D (O1/O2) | P0 direct fan-out, Runs/RunSteps, AG-UI merge/replay | 0.1 | Two-session concurrency and refresh E2E | Specified; unimplemented |
| Real-time typed generative UI in chat | P (K) | P (G1) | D (O1/O2) | Controlled registered React components over AG-UI; app-owned state | 0.1 | Component conformance, interaction/replay and accessibility evidence | Specified; unimplemented |
| Exact human approval, policy and auditable external actions | D (K) | P (G1/G2) | D (O1/O2) | Immutable proposals, trusted UI, pause/resume, account pinning, read reconciliation | 0.1 | Deny/no-write, stale, duplicate, restart and provider receipt tests | Specified; unimplemented |
| Reusable skills with versions/tests/bindings | D (K) | D (G2) | P (O1/O2) | SK-001–SK-008 for 0.2; SK-009 beta; SK-010 GA | 0.2 | Save/test/version/rollback/import/export and invocation lineage | Specified; unimplemented |
| Files, URLs, repositories and verifiable citations | D (K) | D (G1) | P (O1/O2) | KN-001–KN-010 for 0.2; KN-011 beta; KN-012 GA | 0.2 | Malicious-source matrix, authorization, exact citation and delete propagation | Specified; unimplemented |
| Durable scoped and reviewable memory | D (K) | P (G1/G2) | P (O1/O2) | MEM-001–MEM-009 for 0.2; MEM-010 beta; MEM-011 GA | 0.2 | Proposal/source/edit/delete/expiry/conflict/why-known suite | Specified; unimplemented |
| App-owned typed business data and views | D (K) | — | P (O1/O2) | REC-001–REC-010 for 0.2; REC-011 beta; REC-012 GA | 0.2 | Schema/record/tool/view/provenance/import E2E | Specified; unimplemented |
| Multiple humans, roles and private channels | D (K) | D (G1) | D (O1/O2) | TEAM-001–TEAM-008 | 0.2 | Invite/private-channel/revocation/realtime isolation E2E | Specified; unimplemented |
| Explicit external connections and tool grants | D (K) | D (G1/G2) | D (O1/O2) | CN-001–CN-009 alpha; CN-010–CN-011 beta; CN-012 GA | 0.2 baseline; 0.3 per-human | OAuth/account/tool/drift/revoke isolation evidence | Specified; unimplemented |
| Search, inspectable run history and notifications | P (K) | P (G1/G2) | D (O1/O2) | SRCH-001–SRCH-008 and NT-001–NT-007 alpha; workflow history/notifications beta | 0.2 | Private-scope search/rebuild, run-lineage and notification authorization E2E | Specified; unimplemented |
| Saved workflows, schedules and event triggers | D (K) | D (G2) | P (O1/O2) | WF-001–WF-012 beta; WF-013 GA | 0.3 | Schedule/webhook/dedupe/retry/dead-letter/history E2E | Specified; unimplemented |
| Cross-channel handoff and team approval routing | D (K) | P (G2) | D (O1/O2) | WF-009–WF-010 plus WF-012 revocation; TEAM-009–TEAM-011 | 0.3 | Bounded envelope/loop, approver-group and delegation E2E | Specified; unimplemented |
| Integrity-verifiable audit and governed retention/export | P (K) | P (G1/G2) | D (O1/O2) | PSEC-012 and RET-001–RET-008 alpha; RET-009 beta; RET-010 GA | 0.2 | Tamper/export authorization, delete propagation, legal-hold and restore tests | Specified; unimplemented |
| Reproducible open-source self-hosting and full export | P (K) | — | D (O1/O2) | OSS-001–OSS-007/OSS-010 alpha; OSS-009 beta; OSS-008 GA | 0.2 baseline; 1.0 supported contract | Clean install, upgrade, backup/restore, export/import, SBOM/provenance | Specified; unimplemented |

## Claim gates

- **Before 0.3:** describe ForgeRoom by its implemented release capabilities. Do not say product parity with Kylon, Grok Bot or OpenBot.
- **0.3 eligibility:** every required P0/P1/P2 task is done; the beta checklist and browser journeys pass; each row claimed as comparable links a current user document and a test/report produced by released artifacts.
- **Source uncertainty:** a `P` or `—` competitor cell cannot be promoted to `D` from memory, marketing inference or an old screenshot. Use a dated public source or label the claim as an inference.
- **No aggregate shortcut:** matching one showcase flow or architecture does not establish product parity.
- **Excluded comparison:** computer/browser takeover is explicitly out of scope through 1.0 and must be stated in every comparison.
- **Update discipline:** competitor sources, ForgeRoom release, test build SHA, evidence URL/path, owner and review date are updated for every public parity statement.

## Release evidence register

Populate this only from released artifacts.

| ForgeRoom release/build | Matrix review date | User-doc link | Automated evidence | Trial evidence | Approved claim | Reviewer |
| --- | --- | --- | --- | --- | --- | --- |
| Not released | 2026-08-25 | — | — | — | No parity claim | unassigned |
