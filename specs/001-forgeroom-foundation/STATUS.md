# ForgeRoom 0.1 foundation status

| Field | Current value |
| --- | --- |
| Overall | M0 Demo contract done; M1 Foundation done; P0-315/P0-317/P0-407/P0-316/P0-410/P0-408 done; P0-301–P0-314, P0-404, P0-405 done |
| Current phase | Phase 1 — Foundation / M5 Verification |
| Active task | P0-501 (in_progress); P0-504 (in_progress; providers E2E blocked on secrets) |
| Next task | P0-501 remaining unit gaps (interaction CAS extract next); finish P0-504 providers when secrets available; then P0-502 / P0-503 / P0-506 |
| P0 blockers | Run-limit hard enforcement (P0-204/OD-008 evidence); P0-504 providers E2E needs secrets |
| Last updated | 2026-08-29 (P0-501 slice 2 controlled limits; STATUS conflict resolved; P0-504 #75–#77 merged) |

## Milestones

| Milestone | Status | Exit condition |
| --- | --- | --- |
| M0 Demo contract | done | P0-000 done |
| M1 Foundation | done | P0-101 through P0-108 done |
| M2 TrueForge + AG-UI runtime and Task integration | blocked | P0-109, P0-201–P0-206, P0-208, P0-210–P0-213 done |
| M3 Tools, approvals and UI capabilities | blocked | P0-301–P0-318 done |
| M4 Product UI | done | P0-401–P0-408 and P0-410 done |
| M5 Verification | blocked | P0-501 through P0-506 done |

## Current decisions needed

- P0-210 status is inconsistent and needs an owner to reconcile: `tasks.md` marks it `[x] done`
  and both dependents (P0-211, P0-314) are `done`, but the task file front matter still says
  `in_review` with owner `cursor-agent`. The index is authoritative for the checkbox, so the task
  file is the likely stale side — but moving a task to `done` requires a reviewer to confirm its
  acceptance criteria and evidence, so this is not resolved here.

Still open for later owner tasks (see `decisions/OPEN.md` and `provider-fixtures/`):

- Demo deployment diagram for persistent `ARTIFACT_STORAGE_DIR` mount (OD-006/OD-007) — adapter implemented; live host probe still candidate.
- TrueForge sandbox-file → application artifact retain path implemented in P0-312; live TrueForge turn probe still blocked on OpenAI billing.
- Run-limit hard enforcement evidence (P0-204 / OD-008).
- OD-009 synthetic fixture `#35` live write/reconcile/reset verified (`pthebesfsu-a11y` write collaborator).

Verified 2026-08-26 / 2026-08-27 live probes:

- Composio github toolkit, tool slugs, account suffix `nizY`, descriptor hashes.
- P0-301 hosted MCP direct-tools session (exact three tools; forbidden meta surfaces absent; MCP secrets server-side only).
- Synthetic provider fixture `pramodthe/ForgeRoom#35` (label `forgeroom-p0-probe`); live Composio write/reconcile/reset **verified 2026-08-27**: `pthebesfsu-a11y` has ForgeRoom **write** (invite accepted; not pending). Earlier same-day 403 ("Must have admin rights to Repository") was pre-acceptance; re-probe add/remove/GET succeeded with existing label + `repo` OAuth scope.
- Daytona P0-311 verified 2026-08-27: wire→lifecycle mapping, credential canary absent, egress measured, fixture demo-lines SHA; TrueForge→storage extraction implemented in P0-312 (live turn probe blocked on OpenAI billing).
- Local `ARTIFACT_STORAGE_DIR` adapter retain (**verified in P0-310**; persistence probe in adapter tests).
- Local TrueForge + OpenAI: preset `openai/gpt-5-4-mini`; Operator smoke turn `p0-openai-ok`; Research permission exactDiff frozen.
- Save-as-skill TrueForge instruction-only turn `done` (session suffix `30yd5y`, turn suffix `194qgy`, output sha256 `550cc8bd…82530c9`); Task/Save-as-skill fixtures verified.
- Local deployment preflight **pass** (TrueForge + OpenAI).
- DB schema ready; P0-105 seed/reset merged.
- P0-305 live real read of `GITHUB_GET_AN_ISSUE` on `#35` after exact account/tool preflight (**verified 2026-08-27**); safe attributed summary only; expired auth → `blocked_connection`.
- P0-304 live Connections status/Test/Reconnect (**verified 2026-08-27**); fixed account suffix `nizY`; Connect Link without adopting provisional account; expiry→`blocked_connection`.
- P0-309 live approval-gated write on `#35` (**verified 2026-08-27**): deny left labels unchanged; approve added `forgeroom-p0-probe`; GET reconcile → `reconciled_succeeded`; timeout classified `unknown` with `automaticRetry=false`.

Frozen without secrets:

- P0 feature profile disables native subagents, coordinator synthesis, component catalogue expansion and `iframe_v1`.
- Optional CopilotKit disabled-unless-parity policy for P0-210.
- Local artifact storage directory adapter for development.
- Controlled-UI / coworker / Task / skill / run-limit fixtures under `provider-fixtures/`.

Never put credentials in this file.

## Recently completed

- P0-501 slice 2 (2026-08-29): controlled prop/presentation adversarial unit tests + OD-012 draft exactDiff lock; STATUS merge conflict resolved.
- P0-407 → `done` (2026-08-29): axe + 1440px visual baselines; slices 1–3 merged (#68, #71).
- P0-315 → `done` (2026-08-29): component/interaction gateway merged #70.
- P0-317 → `done` (2026-08-29): `DataGrant.max_time_ms` enforced merged #69.
- P0-410 → `done` (2026-08-29): coworker/task/skill review flows merged PRs #62–#66.
- P0-404 / P0-405 → `done` (2026-08-29): spec closeout after merged PR stack #48–#54; approval/question/run drawer and Work/Artifacts/Context tabs acceptance criteria verified.
- P0-404 / P0-405 closeout (2026-08-29): merged PR #54 (trusted HITL host-open hook, Work tab stop, task evidence).
- Status re-triage (2026-08-28): P0-316, P0-318, P0-404 and P0-405 were marked `blocked` while
  every listed dependency was already `done`; corrected to `ready`.
- Local gate run at `34bf326`: `pnpm lint`, `typecheck`, `test` (23 files, 116 passed, 1 skipped)
  and `build` all pass. `pnpm install` was needed first — a stale `packages/domain/node_modules`
  link made `@forgeroom/composio` unresolvable.

- P0-312 artifact extraction and safe preview (TrueForge sandbox-file discovery; path/MIME/size validation; durable hash publication; authenticated preview with CSP/script disabled; image re-encode via sharp; worker `publish_sandbox_artifact` wiring).
- P0-310 durable artifact storage (local-directory adapter; workspace/channel-scoped keys; idempotent content-addressed publish; authenticated GET/download; persistence probe; preview deferred to P0-312).
- P0-208 capability intersection and session rotation (policy/grant/account/AgentSpec ∩; rotating blocks claims; atomic generation swap retains old TrueForge IDs; normals rebind / responses never migrate; MCP reconcile without claim denial; skill attach cannot expand authority; `session-rotation.verified.json`).
- P0-304 Connections API and health (fixed-account status/Test/Reconnect; Connect Link workspace-bound; expiry→`blocked_connection` with no fallback; catalog endpoints closed; `connections.verified.json`).
- P0-309 approval-gated deterministic write (`GITHUB_ADD_LABELS_TO_AN_ISSUE` in approval-required set; deny→zero mutation; binding change→new proposal; allow→one PauseResume intent; timeout→`unknown` no auto-retry; GET reconcile to final state; verified receipt only when adapter verifies; `deterministic-write.verified.json`).
- P0-305 real Composio read path (exact account/tool preflight; TrueForge direct-tool only; safe `tool.started`/`tool.succeeded`; raw body/credentials excluded; expired auth → `blocked_connection`; `real-read.verified.json`).
- P0-308 atomic response-only resume (CAS PauseResume; encrypted payload before TrueForge; response-only turn; history reconcile; AG-UI resume via PauseGroup service; ciphertext expiry; `pause-resume.verified.json`).
- P0-307 secure decision API/card (ApprovalCard contract; GET/POST approvals; auth+CSRF+Origin+recent-auth; CAS allow/deny; stale/expiry; deny event with provider_calls=0; request_changes → correction draft only; no TrueForge resume).
- P0-306 PauseGroup/RequiredAction persistence (keyed to turn+generation; mixed approval/question/connection capture; ActionProposal binding hashes + adapter-redacted preview; AgentTurn `required_actions` with nonterminal RunStep; normal claims blocked while unresolved; `pause-group.verified.json`).
- P0-303 curated ToolPolicyDefinitions for the three P0 Composio tools (descriptor-hash binding, redaction/preview, verified idempotency, demo write reconcile/receipt, unknown writes blocked; `tool-policies.verified.json`).
- P0-302 connector/AgentSpec manifest verification (`verifyP0Manifest`, TrueForge header-auth `composio_github` registration, redacted `preflight.verified.json`, live descriptor+ACTIVE account preflight 2026-08-27).
- P0-301 Composio hosted MCP direct-tools session (`ComposioSessionClient`, redacted `session.verified.json`, live tool-list probe 2026-08-27).
- P0-000 demo/tool contract freeze completed (Save-as-skill TrueForge Run binding verified 2026-08-27).
- P0-105 idempotent demo fixtures merged via PR #22.
- P0-314 governed component registry/grants merged via PR #30.
- P0-212 first durable channel timeline slice (lifecycle/text mirror + web timeline) merged via PR #29.
- P0-211 TrueForge-to-AG-UI adapter bootstrap merged via PR #28.
- P0-402 channel composer and coworker roster merged via PR #19 (`eb560d3`).
- P0-401 authenticated three-pane app shell merged via PR #15 (`c4e08e3`).
- P0-108 bounded channel context and pins merged to `main` via PR #10 (`1c3589b`).
- P0-205 mention/team router merged to `main` via PR #11 (`fe36cd1`).
- P0-107 canonical event log and resumable SSE merged to `main` via PR #8 (merge commit `ffbca91`).
- P0-106 channel/coworker API accepted via PR #7 after archive-race remediation, full CI, and exact-head Qodo review.
- P0-104 owner authentication and authorization merged to `main` (`ea3db05` via PR #5) after Qodo-clean head and green CI.
- P0-103 database schema and session workspace boundary merged to `main` (`d7b6273`).
- P0-102 shared contracts merged to `main`.
- P0-101 scaffold accepted after clean-clone verification and green GitHub CI.
- Split canonical specifications created.
- Product, technical, UX, and security reviews incorporated.
- AG-UI northbound protocol, shared state, interrupt and durable replay contracts added.
- P0 narrowed to controlled GenUI; the mature declarative generated-document design is retained for P1.
- Conversational coworker creation, TaskRecord and Save-as-skill added to the P0 product loop.
- Startup-wide 0.2/0.3/1.0 domain and task specifications added under `../002-forgeroom-platform/`.

## Status update rule

Update this file whenever a task enters `in_progress`, becomes blocked, or reaches `done`. Do not use it as a substitute for evidence in the task file.
