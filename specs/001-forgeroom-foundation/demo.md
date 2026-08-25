# ForgeRoom 0.1 demo contract

| Field | Value |
| --- | --- |
| Status | Blocked until P0-000 freezes candidates and P0-210 selects the AG-UI package graph |
| Duration | Three minutes maximum |
| Product framing | General AI coworker channel; scenario is only a fixture |

## Phase 0 decisions

P0-000 replaces provider/demo TBDs and freezes package candidates/fixtures. P0-210 replaces the exact pure AG-UI rows after compatibility evidence and records optional CopilotKit as disabled unless parity-proven.

| Decision | Locked value |
| --- | --- |
| Product name | TBD |
| Demo task | TBD |
| Seeded coworker name/role/model | TBD |
| Conversationally created coworker prompt/expected role/model | `Create a Research coworker that can read GitHub and web data but cannot modify anything.`; exact preview TBD |
| Exact `@ag-ui/*` package versions | TBD; one compatible stable version across packages |
| Optional CopilotKit runtime/React versions | Disabled by default; fill only after a coherent-graph parity pass |
| Controlled component demo | TBD DataTable + bar/line chart + TaskCard + ArtifactCard + ChoiceForm/filter schema |
| Task fixture | One fixed TaskRecord with source/status transition and reset values TBD |
| Save-as-skill fixture | One completed Run → reviewed instruction-only SkillVersion → originating coworker attachment/session rotation TBD; invocation begins in 0.2 |
| Composio application 1 | TBD |
| Composio application 2 | none or TBD |
| Read tool slug | TBD |
| Deterministic write tool slug | TBD |
| Reconciliation read tool slug | TBD |
| Pinned connected-account IDs | Stored only in secret configuration; record redacted suffixes here |
| Observed descriptor hashes | TBD |
| Synthetic provider fixture | TBD |
| Fixture reset command | TBD |
| Artifact storage | TBD |
| Deployment topology | TBD |
| Run wall-time limit | TBD |
| Token/cost limit | TBD |
| Tool-call limit | TBD |
| Sandbox-time limit | TBD |

## Tool selection rules

- Select one real read and one deterministic, read-after-write-reconcilable update.
- Prefer setting a known issue or record field to a known value.
- Do not use email or message creation to claim exactly-once behavior.
- Export the live tool name, input schema and relevant annotations.
- Check in ToolPolicyDefinitions and descriptor hashes.
- Pin every toolkit to an exact connected-account ID.
- Use synthetic fixture records and a safe reset command.

## Demo narrative

1. Open a channel with one seeded coworker and the fixed service-account badge.
2. Ask the trusted builder to create the read-only Research coworker, inspect exact permissions/denials and confirm it.
3. Assign one Task to both coworkers with explicit mentions or `@team`; the authoritative TaskCard appears.
4. Show two persistent coworkers working concurrently in separate TrueForge sessions.
5. Show one real Composio read rendered as an inline controlled table/chart with accessible fallback.
6. Use one bounded ChoiceForm/filter and show its persisted visible state.
7. Show generated work executing in a TrueForge Daytona sandbox and open the durable ArtifactCard.
8. Reach a real external write proposal in trusted host UI and show exact account, target, redacted arguments, effect and expiry.
9. Refresh and restore the same Task, controlled component state, artifact and pending decision.
10. Approve the exact proposal and show the deterministic provider final state after read reconciliation.
11. Save the completed Run as a reviewed private skill version and attach it without new authority.
12. Open the safe audit receipt linking source message, coworkers, Task, UI instance, artifact, skill, approval and verified result.

## Three-minute shot plan

| Time | Shot | Proof |
| --- | --- | --- |
| 0:00–0:25 | Natural-language coworker draft, permission preview and confirm | Agent-as-member product and bounded authority |
| 0:25–0:50 | Create Task and run two concurrent coworker lanes | Channel collaboration, app-owned work and TrueForge sessions |
| 0:50–1:20 | Real Composio data becomes table/chart; use ChoiceForm/filter | AG-UI, controlled TrueForge GenUI and real data |
| 1:20–1:40 | Daytona artifact | Harness sandbox and durable output |
| 1:40–2:15 | Exact trusted approval card and browser refresh | Safety boundary and deterministic replay |
| 2:15–2:35 | Approve and reconcile | Real deterministic external result |
| 2:35–2:50 | Save reviewed Run as private skill | Repeatable work and TrueForge skills |
| 2:50–3:00 | Receipt | Task/UI/artifact/skill/action lineage |

## Demo fixture requirements

- Reset is idempotent and safe to run twice.
- No personal or production data.
- Read result is stable enough for rehearsal.
- Write target is uniquely identifiable and deterministic.
- Reconciliation can distinguish expected state from failure.
- Artifact output is small, visually useful and safely previewable.
- Controlled table/chart/Task/Artifact props are deterministic, visually polished and within limits.
- The bounded interaction changes visible state without directly invoking an external mutation.
- CoworkerDraft and skill manifests are deterministic enough for review and use only current literal catalogue IDs.
- Fixed account remains visibly labeled throughout.

## Preflight

Before recording, the internal preflight page must show green for:

- Database.
- Application session/auth.
- TrueForge server.
- Model provider through TrueForge.
- Daytona.
- Composio session and exact pinned account.
- Expected direct tools and descriptor hashes.
- Compiled AgentSpec approval set.
- Artifact storage.
- Worker and queue heartbeat.
- Pinned pure AG-UI compatibility and official-client conformance fixture; optional CopilotKit disablement/parity evidence.
- Controlled component registry/grants and renderer versions.
- Coworker Builder schema/catalogue/policy resolution, Task schema and skill package/session-rotation checks.

Preflight displays no secret values.

## Automated branches not shown in the video

- Denial creates zero provider mutation.
- Concurrent decision protection.
- API-restart approval persistence.
- Lost resume-response reconciliation.
- Descriptor drift failure.
- Account expiry without fallback.
- Session rotation after grant revocation.
- Sandbox egress readiness failure.
- Forged component tool, revoked component and invalid AG-UI patch failure.
- CoworkerDraft stale/overgrant/duplicate-confirm, Task stale-revision/field-grant and skill secret/capability-expansion rejection.

## Recording checklist

- [ ] Fixture reset immediately before recording.
- [ ] Browser contains no personal tabs, cookies or notifications.
- [ ] Network and provider health preflight passes.
- [ ] No raw JSON, secrets, reasoning or debug panels visible.
- [ ] Conversationally created and seeded coworkers are clearly distinguishable.
- [ ] Table/chart/Task/Artifact output is inline, readable and has an accessible alternative.
- [ ] One interaction visibly changes state or continues the logical turn through AG-UI.
- [ ] Approval card target and fixed service identity are readable.
- [ ] Refresh occurs while the proposal is pending.
- [ ] Refresh restores identical controlled UI, Task, artifact and state hashes without regeneration.
- [ ] Save-as-skill review shows exact inputs/tools/output/approval boundary and no new authority.
- [ ] Final state is verified by a read, not narration alone.
- [ ] Video calls the scenario a demo, not the product vertical.
- [ ] Fallback footage, if used, is labeled honestly.
