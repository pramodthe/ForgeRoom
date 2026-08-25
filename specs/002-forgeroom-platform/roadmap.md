# Product roadmap and release gates

## Sequencing rule

The roadmap grows one trusted work loop rather than shipping disconnected feature demos:

```text
request → governed coworker → current sources → visible work → durable record/artifact
        → exact approval → verified action → reusable skill → scheduled workflow
```

Each release must keep the complete earlier loop working. A later capability may not introduce a second ungoverned execution path.

## 0.1 — Startup foundation and showcase release

Canonical implementation scope: [`../001-forgeroom-foundation/`](../001-forgeroom-foundation/).

Required outcomes:

- A user conversationally creates a coworker from a natural-language job description, reviews exact permissions, then confirms.
- Two persistent coworkers work concurrently in one channel using separate TrueForge sessions; P0 does not enable temporary native subagents or coordinator synthesis.
- A request creates or updates an application-owned Task record.
- Real connected data becomes a controlled inline chart/table with one bounded interaction and accessible fallback over AG-UI.
- Daytona produces a durable artifact.
- One real external mutation pauses for exact trusted-host approval, survives refresh, executes once through the resume path, and is reconciled by read.
- A successful run can be reviewed and saved as a versioned private TrueForge skill.
- Refresh deterministically replays channel, controlled GenUI, Task, artifact, approval, and audit state.

Explicitly non-gating:

- Custom generated HTML/CSS iframe rail.
- File uploads, long-term memory editor, multi-human collaboration, schedules, triggers, and cross-channel workflows.

Exit gate:

- Every P0 task and checklist passes from a clean clone.
- The three-minute demo completes three consecutive times against resettable non-production data.
- No mock is presented as a live provider result.

## 0.2 — Private alpha

Goal: a small real team can self-host the product and use it every day without relying on chat history as the database.

Required outcomes:

- Invite members; owner/admin/member roles; private channels; notification preferences.
- Upload PDF, CSV, image, and text; ingest URL and repository references; cite exact sources.
- Reviewable coworker/channel/workspace memory with proposals, source links, edit, delete, expiry, and revision history.
- Skill catalogue with drafts, versions, test runs, attach/detach, import/export, and rollback.
- Multiple workspace service connections with safe OAuth lifecycle, exact account/tool grants, health, revocation, and descriptor drift handling.
- Typed record schemas, CRUD commands, provenance, views, validation, and realtime updates.
- Permission-safe global search across messages, records, coworkers, sources, skills, memories, Runs, artifacts, and receipts.
- Integrity-verifiable workspace audit, explicit `standard-1` retention/classification/deletion behavior and authorized same-release portable export/import.
- An in-place 0.1→0.2 migration that preserves stable IDs, history, permissions, pending actions and deterministic replay.
- Supported Docker-based single-node install, backup/restore, same-release portable snapshot/import for every shipped alpha domain, upgrade test, opt-in telemetry, and operator health.
- Open-generated iframe rail may ship only as an off-by-default experimental feature after its existing security conformance suite passes.

Exit gate:

- Five internal/design-partner workspaces complete a two-week usage trial with no unresolved critical data-loss or authorization defect.
- Backup/restore and the documented 0.2 release-line snapshot/import work on the immediately previous supported release fixture.
- Every memory and knowledge answer exposes sources or explicitly says no source was available.

## 0.3 — Team beta

Goal: repeatable work can safely run without a person initiating every turn.

Required outcomes:

- Saved versioned workflows with owning coworker, inputs, outputs, approval boundary, failure policy, and destination.
- Time-zone-aware schedules and verified webhook/provider event triggers.
- Test runs, pause/enable, deduplication, bounded retries, dead-letter state, run history, and notifications.
- Cross-channel handoff with explicit destination grants, context envelope, hop/loop limits, and visible lineage.
- Approver groups, workspace approval inbox, per-human connections where supported, delegated authority, presence, and team notifications.
- Stable extension SDK for skills, record schemas, controlled components, connector policy packs, and triggers.

Exit gate:

- At least three design partners run a production-like scheduled workflow for 30 days.
- Every triggered run is attributable, deduplicated, budgeted, inspectable, stoppable, and governed by the same action gateway as interactive runs.
- The dated comparator matrix in `parity.md` is verified row by row with released-artifact tests, user documentation and trial evidence.

## 1.0 — General availability

Goal: the open-source core is operable, upgradeable, and supportable for production teams.

Required outcomes:

- Stable public API/event/extension contracts and documented compatibility policy.
- Zero-downtime-compatible migrations where deployment mode supports them; tested rollback or forward-fix procedure.
- High-availability worker/scheduler option, disaster recovery, retention controls, quotas, and performance budgets.
- Hosted multi-tenant deployment with tenant isolation; optional enterprise identity features may remain separately packaged but cannot weaken core portability.
- Signed extension distribution, vulnerability response, SBOM, release provenance, contributor governance, and LTS policy.

Exit gate:

- Independent security review has no unresolved critical/high issue.
- Recovery point/recovery time targets and load budgets pass in the supported deployment topologies.
- A self-hosted workspace can export all user-owned data without contacting the hosted service.

## Product metrics

| Metric | Definition | Guardrail |
| --- | --- | --- |
| First trusted result | Time from workspace creation to a cited artifact/record from a coworker | Do not reduce by granting ambient tools |
| Work completion | Runs ending in accepted record/artifact or verified external result | Exclude abandoned prose-only turns |
| Approval precision | Approved proposals that execute the exact displayed effect | Target 100%; mismatch is a security incident |
| Reuse rate | Successful runs later saved as skills or workflows | Must retain validation and approval boundaries |
| Source coverage | Consequential claims with current source links | Missing source is visible, not fabricated |
| Automation health | Triggered runs successful or explicitly failed within SLO | No silent drops or infinite retries |
| Restore confidence | Latest backup restored and verified | Required before release |

## Scope-change rule

A release item moves only through a spec change that updates its domain requirements, task graph, tests, status, demo/user docs, and migration impact. “Implemented enough for the demo” is not a valid reason to weaken an invariant.
