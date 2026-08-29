# P0 requirements release checklist

Do not check an item until its linked task is `done` and evidence exists.

## Product and channel

- [x] Authenticated owner can log in and logout invalidates the session. (`P0-104`)
- [x] Owner can create, list, rename, open and archive a channel. (`CH-001`, `P0-106`)
- [x] Owner can conversationally draft a coworker, review exact effective/denied permissions, confirm idempotently, edit it and add/remove it from a channel. (`AG-007`, `AG-008`, `AG-010`–`AG-012`, `P0-106`, `P0-213`, `P0-410`)
- [x] Roster shows both coworkers, availability and assignment. (`CH-009`, `P0-402`)
- [x] Recipient and effective-tool preview appears before send. (`CH-011`, `P0-402`)
- [x] `@team` and mention routing use direct one/two-coworker fan-out with no coordinator path. (`OR-002`, `P0-205`)
- [x] Channel events replay after refresh without gaps. (`CH-004`, `CH-005`, `P0-107`)
- [x] Context summary and sourced pin/unpin work without cross-channel leakage. (`ME-001`–`ME-003`, `P0-108`)

## Runtime

- [x] Each persistent coworker has a distinct channel-specific TrueForge session. (`AG-005`, `P0-201`)
- [x] Second message to a busy session queues rather than cancelling. (`RUN-002`, `RUN-003`, `P0-202`)
- [x] Two different coworker sessions execute concurrently. (`OR-001`, `P0-206`)
- [x] Stop and correction are explicit and visibly separate. (`RUN-004`, `RUN-007`, `RUN-009`, `P0-204`)
- [x] Compiled P0 AgentSpecs disable native subagents and unexpected child activity grants nothing. (`AGUI-007`, `P0-201`, `P0-211`)
- [x] `turn.done` with required actions cannot terminalize the RunStep. (`P0-203`)
- [x] Capability-affecting edits rotate session generation and stale old actions. (`P0-208`)

## AG-UI and generative UI

- [x] Exact pure AG-UI versions and TrueForge component-tool bridge are proven; optional CopilotKit is disabled or separately parity-proven. (`AGUI-009`, `P0-210`)
- [x] Each persistent coworker has a stable logical AG-UI thread and official-client-compatible run endpoint. (`AGUI-001`–`AGUI-004`, `P0-211`)
- [x] Durable channel envelope multiplexes concurrent threads and replays without attribution loss. (`AGUI-002`, `AGUI-003`, `P0-212`)
- [x] Shared state/activity snapshots and RFC 6902 deltas recover from divergence. (`AGUI-006`, `P0-212`)
- [x] Required actions use AG-UI interrupts without completing the application RunStep. (`AGUI-005`, `P0-211`)
- [x] Governed component registry is versioned, default deny and separates render/data/action grants. (`GUI-002`, `GUI-004`, `GUI-005`, `P0-314`)
- [x] TrueForge component calls create immutable replayable UIInstances through the interaction gateway. (`GUI-008`, `GUI-011`, `P0-315`)
- [x] DataTable, bar/line chart, TaskCard, ArtifactCard and ChoiceForm/filter are polished, bounded, accessible, persisted and safely dispatched. (`GUI-001`, `GUI-003`, `GUI-006`, `GUI-013`, `GUI-014`, `P0-315`, `P0-316`, `P0-408`)
- [ ] P0 does not register/accept/persist/deploy `generate_open_ui` or `iframe_v1`; unsupported input falls back safely. (`GUI-007`, `P0-506`)
- [x] Rich controlled timeline survives refresh; exact grants are visible in coworker review/editor. (`P0-408`, `P0-410`)

## Tasks and skills

- [x] One application-owned TaskRecord has guarded create/update, optimistic revision, immutable history, provenance and channel/audit events. (`TR-001`–`TR-003`, `P0-109`)
- [x] A completed Run becomes a reviewed immutable private SkillVersion, attaches only within existing grants and rotates the affected session. (`SK-001`–`SK-005`, `P0-208`, `P0-318`)

## Composio and approvals

- [x] Exact direct-tool manifest and pinned accounts match Phase 0 contract. (`TL-001`–`TL-005`, `P0-301`)
- [x] Connector and AgentSpec approval surfaces verify separately at startup. (`TL-006`, `TL-007`, `P0-302`)
- [x] Connections screen is fixed-account health/Test/Reconnect only. (`TL-011`, `P0-304`)
- [x] Every enabled tool has a reviewed ToolPolicyDefinition. (`P0-303`)
- [x] Real read appears with safe request/receipt summary. (`P0-305`)
- [x] PauseGroup captures every required action exactly once. (`AP-002`, `AP-009`, `AP-013`, `P0-306`)
- [x] Approval card binds exact tool, account, descriptor, target, arguments, artifact, policy and expiry. (`AP-004`–`AP-006`, `P0-307`)
- [x] One response-only resume consumes a complete group. (`AP-007`, `AP-010`, `AP-011`, `AP-013`, `P0-308`)
- [x] Denial produces zero mutation and deterministic approval is read-reconciled. (`AP-008`, `P0-309`)

## Sandbox, artifact and audit

- [x] Daytona path produces visible sandbox activity. (`SB-001`, `SB-002`, `P0-311`)
- [x] Artifact is validated, durably copied, revisioned and safely previewed. (`SB-003`–`SB-005`, `P0-310`, `P0-312`)
- [x] Sandbox receives only synthetic/public data while egress is open. (`ADR-005`, `P0-311`)
- [x] Receipt contains declared lineage, hashes and safe verified result without credentials/reasoning. (`AU-001`–`AU-004`, `P0-313`)

## Product quality

- [x] Required visual states, three-pane channel UX, coworker builder, Task/skill surfaces and rich controlled UI are complete. (`P0-401`–`P0-408`, `P0-410`)
- [x] Keyboard, live-region, reduced-motion and AA checks pass. (`P0-407`)
- [ ] Unit, integration, security, browser and AG-UI/GenUI conformance suites pass. (`P0-501`–`P0-506`)
- [ ] Clean-clone setup, preflight and three-minute rehearsal pass. (`P0-505`)
