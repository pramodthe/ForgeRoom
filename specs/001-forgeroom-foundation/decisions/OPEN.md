# Open decisions

Only unresolved choices that can change implementation belong here. P0-000 freezes provider/demo candidates; P0-210 selects the package graph; the named implementation task resolves each remaining choice before its dependent work begins.

| ID | Decision | Blocks | Resolution evidence |
| --- | --- | --- | --- |
| OD-002 | One or two Composio apps | P0-301 onward | Live session/tool probe |
| OD-003 | Exact read, deterministic update and reconciliation slugs | P0-303 onward | Descriptor export and live safe fixture test |
| OD-004 | Pinned account IDs | P0-301 onward | Redacted account suffix and status probe |
| OD-005 | Model preset per coworker | P0-201, P0-213 | Reliable seeded and conversational-provisioning fixture runs with native subagents disabled |
| OD-006 | Artifact storage for demo deployment | P0-310 onward | Upload/download persistence probe |
| OD-007 | API/worker deployment topology | P0-505 deployment/release | Checked-in deployment diagram/config and preflight probe |
| OD-008 | Run and sandbox limits | P0-204 onward | Accepted budget values and watchdog test |
| OD-009 | Exact demo task and synthetic fixture | P0-105, P0-505 | Reset twice and complete manual path |
| OD-010 | Exact stable pure `@ag-ui/*` matrix and optional-CopilotKit enable/disable decision | P0-211 onward | P0-210 official-client, fixture-backed TrueForge bridge, lockfile/startup evidence and optional gateway parity proof |
| OD-011 | Controlled DataTable/bar-or-line chart, TaskCard, ArtifactCard and ChoiceForm/filter demo fixture | P0-316 onward | Deterministic bindings, accessible fallbacks, Task/artifact references and repeated visual probe |
| OD-012 | Conversational coworker draft prompt/expected permission preview and instruction-only Save-as-skill fixture | P0-213/P0-318 onward | Exact read-only draft diff, stale/confirm probe, reviewed skill manifest, attachment and session rotation |

When resolved, update `demo.md`, `STATUS.md`, affected contracts and an ADR if the decision has architectural consequences.

Resolved: the product name is **ForgeRoom**, confirmed by the founder on 2026-08-25. The public repository is `pramodthe/ForgeRoom`.
