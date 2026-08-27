# Open decisions

Only unresolved choices that can change implementation belong here. P0-000 freezes provider/demo candidates; P0-210 selects the package graph; the named implementation task resolves each remaining choice before its dependent work begins.

| ID | Decision | Blocks | Status after P0-000 | Resolution evidence |
| --- | --- | --- | --- | --- |
| OD-002 | One or two Composio apps | P0-301 onward | verified `github` only (suffix `nizY`) | Live toolkit/account probe 2026-08-26 |
| OD-003 | Exact read, deterministic update and reconciliation slugs | P0-303 onward | verified `GITHUB_GET_AN_ISSUE` / `GITHUB_ADD_LABELS_TO_AN_ISSUE` / `GITHUB_GET_AN_ISSUE` | Descriptor hashes + write/reconcile/reset probe |
| OD-004 | Pinned account IDs | P0-301 onward | secret env only; redacted suffix `nizY` verified ACTIVE | Redacted account suffix and status probe |
| OD-005 | Model preset per coworker | P0-201, P0-213 | verified `openai/gpt-5-4-mini` for Operator + Research; local TrueForge agents `forgeroom-operator` / `forgeroom-research-draft` | OpenAI provider + smoke turn `p0-openai-ok` |
| OD-006 | Artifact storage for demo deployment | P0-310 onward | local directory frozen for dev; demo adapter candidate | Upload/download persistence probe |
| OD-007 | API/worker deployment topology | P0-505 deployment/release | local + single-service demo topology candidate | Checked-in deployment diagram/config and preflight probe |
| OD-008 | Run and sandbox limits | P0-204 onward | candidate values recorded (180s / 12k tokens / 20 tools / 60s sandbox) | Accepted budget values and watchdog test |
| OD-009 | Exact demo task and synthetic provider fixture | P0-105, P0-505 | TaskRecord `task_demo_reconcile` verified; synthetic provider frozen on ForgeRoom-owned `pramodthe/ForgeRoom#35` (label `forgeroom-p0-probe`). Temporary Hi-Tuto probe discarded (wrong product/repo). Live Composio write/reconcile/reset on `#35` **verified 2026-08-27**: identity `pthebesfsu-a11y` is collaborator **write** (no pending invite); add/remove/GET succeeded after invite acceptance (earlier 403 was pre-acceptance, not missing scopes) | Frozen Task fixture + target `#35`; live label write/reconcile/reset evidence on connected account suffix `nizY` |
| OD-010 | Exact stable pure `@ag-ui/*` matrix and optional-CopilotKit enable/disable decision | P0-211 onward | baseline candidates + disabled-unless-parity policy frozen for P0-210 | P0-210 official-client, fixture-backed TrueForge bridge, lockfile/startup evidence and optional gateway parity proof |
| OD-011 | Controlled DataTable/bar-or-line chart, TaskCard, ArtifactCard and ChoiceForm/filter demo fixture | P0-316 onward | deterministic candidate fixtures checked in under `provider-fixtures/controlled-ui/` | Deterministic bindings, accessible fallbacks, Task/artifact references and repeated visual probe |
| OD-012 | Conversational coworker draft prompt/expected permission preview and instruction-only Save-as-skill fixture | P0-213/P0-318 onward | prompt frozen; model `openai/gpt-5-4-mini`; read-only exactDiff from Composio catalogue; Save-as-skill TrueForge turn verified 2026-08-27 | Exact read-only draft diff + Save-as-skill fixture; UI confirm/stale probe remains P0-213; Skill publish/attach remains P0-318 |

### Frozen by P0-000 (not open)

- Product name: **ForgeRoom**.
- P0 feature profile disables: native subagents, coordinator synthesis, component catalogue expansion, `iframe_v1` (reject as unsupported).
- Optional CopilotKit: disabled unless P0-210 proves coherent-graph parity; no canary/forced override.
- Pure AG-UI baseline **candidates**: `@ag-ui/core@0.0.57` + `@ag-ui/client@0.0.57` (selection still OD-010 / P0-210).

When resolved, update `demo.md`, `STATUS.md`, `provider-fixtures/`, affected contracts and an ADR if the decision has architectural consequences.

Resolved earlier: the product name is **ForgeRoom**, confirmed by the founder on 2026-08-25. The public repository is `pramodthe/ForgeRoom`.
