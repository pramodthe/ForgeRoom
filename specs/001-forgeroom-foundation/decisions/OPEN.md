# Open decisions

Only unresolved choices that can change implementation belong here. P0-000 freezes provider/demo candidates; P0-210 selects the package graph; the named implementation task resolves each remaining choice before its dependent work begins.

| ID | Decision | Blocks | Status after P0-000 | Resolution evidence |
| --- | --- | --- | --- | --- |
| OD-002 | One or two Composio apps | P0-301 onward | preferred candidate `github`; live account/toolkit confirmation blocked-on-secrets | Live session/tool probe |
| OD-003 | Exact read, deterministic update and reconciliation slugs | P0-303 onward | read/reconcile preferred `GITHUB_GET_ISSUE`; write slug still blocked-on-secrets | Descriptor export and live safe fixture test |
| OD-004 | Pinned account IDs | P0-301 onward | redacted template ready; IDs blocked-on-secrets | Redacted account suffix and status probe |
| OD-005 | Model preset per coworker | P0-201, P0-213 | Operator/Research fixture roles candidate; presets blocked-on-secrets | Reliable seeded and conversational-provisioning fixture runs with native subagents disabled |
| OD-006 | Artifact storage for demo deployment | P0-310 onward | local directory frozen for dev; demo adapter candidate | Upload/download persistence probe |
| OD-007 | API/worker deployment topology | P0-505 deployment/release | local + single-service demo topology candidate | Checked-in deployment diagram/config and preflight probe |
| OD-008 | Run and sandbox limits | P0-204 onward | candidate values recorded (180s / 12k tokens / 20 tools / 60s sandbox) | Accepted budget values and watchdog test |
| OD-009 | Exact demo task and synthetic fixture | P0-105, P0-505 | demo Task title/transition candidate; provider record IDs blocked-on-secrets | Reset twice and complete manual path |
| OD-010 | Exact stable pure `@ag-ui/*` matrix and optional-CopilotKit enable/disable decision | P0-211 onward | baseline candidates + disabled-unless-parity policy frozen for P0-210 | P0-210 official-client, fixture-backed TrueForge bridge, lockfile/startup evidence and optional gateway parity proof |
| OD-011 | Controlled DataTable/bar-or-line chart, TaskCard, ArtifactCard and ChoiceForm/filter demo fixture | P0-316 onward | deterministic candidate fixtures checked in under `provider-fixtures/controlled-ui/` | Deterministic bindings, accessible fallbacks, Task/artifact references and repeated visual probe |
| OD-012 | Conversational coworker draft prompt/expected permission preview and instruction-only Save-as-skill fixture | P0-213/P0-318 onward | prompt frozen; expected denials + skill shape candidate; exact catalogue IDs blocked-on-secrets | Exact read-only draft diff, stale/confirm probe, reviewed skill manifest, attachment and session rotation |

### Frozen by P0-000 (not open)

- Product name: **ForgeRoom**.
- P0 feature profile disables: native subagents, coordinator synthesis, component catalogue expansion, `iframe_v1` (reject as unsupported).
- Optional CopilotKit: disabled unless P0-210 proves coherent-graph parity; no canary/forced override.
- Pure AG-UI baseline **candidates**: `@ag-ui/core@0.0.57` + `@ag-ui/client@0.0.57` (selection still OD-010 / P0-210).

When resolved, update `demo.md`, `STATUS.md`, `provider-fixtures/`, affected contracts and an ADR if the decision has architectural consequences.

Resolved earlier: the product name is **ForgeRoom**, confirmed by the founder on 2026-08-25. The public repository is `pramodthe/ForgeRoom`.
