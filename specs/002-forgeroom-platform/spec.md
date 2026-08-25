# ForgeRoom platform specification

| Field | Value |
| --- | --- |
| Feature ID | `002-forgeroom-platform` |
| Status | Approved product direction; implementation tracked by release |
| Product | Open-source AI-native workspace for human and AI teams |
| Depends on | `../001-forgeroom-foundation/` |
| Excludes | Computer use, browser takeover, desktop control |

## Product definition

ForgeRoom is a shared work operating system in which persistent AI coworkers have identities, bounded permissions, scoped memory, reusable skills, connections, tasks, and visible responsibility inside channels with humans.

The product is not a chat wrapper and Composio is not the product. Composio supplies external connectivity; TrueForge supplies the agent harness; ForgeRoom owns the durable workspace, collaboration, governance, business objects, and user experience.

## Product promise

> Describe a coworker, invite it into a channel, give it approved knowledge and tools, then let humans and agents turn requests into reviewable, repeatable work.

## Product principles

1. **Agents are members.** A persistent coworker has an identity, role, owner, permissions, connections, skills, memory, channel membership, work queue, and history.
2. **Channels are the collaboration boundary.** Requests, handoffs, evidence, approvals, artifacts, records, and generated interfaces stay visibly connected.
3. **The application owns truth.** Chat output and GenUI are views; application records, artifacts, memory entries, workflow runs, grants, and audit rows are authoritative.
4. **Authority is explicit.** Reading, rendering, remembering, acting, scheduling, and sharing are separate grants.
5. **Consequential actions remain governable.** An unattended workflow cannot bypass the same policy and approval boundary used by an interactive run.
6. **Sources travel with claims.** Knowledge, memory, records, artifacts, and decisions retain provenance and freshness.
7. **Use the harness; do not rebuild it.** TrueForge owns model execution, sessions, native subagents, skills runtime, sandboxing, pause/resume, and native GenUI. ForgeRoom adds the product layer.
8. **Open source is a product requirement.** Self-hosting, data export, transparent schemas, stable extension contracts, safe defaults, and contribution paths are release criteria.

## Users and jobs

| User | Primary job |
| --- | --- |
| Workspace owner | Create the workspace, choose deployment, manage policy, integrations, retention, and billing where applicable |
| Admin | Manage people, coworker templates, connections, records, knowledge, skills, workflows, and audit access |
| Member | Collaborate in channels, create work, provide sources, review outputs, and approve when authorized |
| Approver | Decide a bounded class of proposals with enough context to understand exact effect |
| Coworker owner | Configure one coworker's role, access, memory, skills, channels, and routines |
| Operator | Monitor run health, queues, triggers, provider drift, backups, and incidents |
| Contributor | Run the project locally, add compatible extensions, tests, docs, and migrations without private services |

## Capability model

| Capability | 0.1 foundation | 0.2 private alpha | 0.3 team beta | 1.0 GA |
| --- | --- | --- | --- | --- |
| Channels, mentions, concurrent coworkers | Complete | Harden | Harden | Scale |
| AG-UI streaming and controlled TrueForge GenUI | Complete | Extend | Extend | Stable API |
| Conversational coworker creation with permission preview | Complete | Templates and versions | Team governance | Stable API |
| Exact approvals, verification, audit | Complete | Multi-user audit and needs-attention inbox | Approver groups, delegation and workspace approval inbox | Stable retention/export |
| App-owned Task record | Complete | Custom record types and views | Workflow-bound records | Stable schema API |
| Save successful run as a private skill | Complete | Catalogue, tests, versions | Workflow-qualified tested skills | Signed shared-package ecosystem |
| External connections and tools | Fixed service identity | Multiple workspace service connections and exact tool grants | Per-human connections and workflow service principals | Stable adapter/policy-pack API |
| User files and knowledge | — | Complete | Team knowledge governance | Scale/connectors |
| Workspace search and Run history | Channel-local only | Cross-domain authorized search | Workflow/trigger/handoff history | Scale/stable API |
| Reviewable scoped memory | Channel pins only | Complete | Shared and policy-governed | Scale/retention |
| Human teams | One owner | Invites, roles, private channels, bounded presence and notifications | Approver groups and delegation | SSO/SCIM optional |
| Workflows, schedules, triggers | — | Specification only; not shipped | Complete | Scale/HA |
| Self-hosting | Developer compose | Supported single-node | Hardened single-node/team trial | HA and published recovery targets |
| Custom open-generated iframe rail | — | Experimental, feature-flagged | Still experimental/non-gating | Optional only after a promotion ADR and dedicated release tasks |
| Computer or browser takeover | Excluded | Excluded | Excluded | Excluded |

Release names are product increments, not promises of calendar dates. [Roadmap gates](./roadmap.md) determine when each label is earned.

## System ownership

| Owner | Authoritative responsibilities |
| --- | --- |
| ForgeRoom | Workspaces, users, memberships, channels, coworkers, grants, connections references, knowledge metadata, memories, skills catalogue, records, workflows, runs, artifacts, UI instances, approvals, notifications, audit, retention, exports |
| TrueForge | Saved agent manifests, sessions, turns, native subagents, skills execution, Daytona sandbox lifecycle, MCP invocation, required-action interrupts, context compaction, native GenUI generation |
| Composio | Connected-account credentials and provider OAuth lifecycle, hosted MCP transport, external application calls |
| External providers | Their own records and final side effects |
| Object/search stores | Bytes and indexes addressed only through ForgeRoom authorization |

The browser talks only to the ForgeRoom API. Credentials and provider authority never enter generated UI or browser-local state.

## Product-wide requirements

| ID | Contract |
| --- | --- |
| PLAT-001 | One canonical workspace event model connects channel messages, coworker runs, records, artifacts, skills, memories, workflows, approvals, and audit without persisting private reasoning. |
| PLAT-002 | Every durable entity is scoped to a workspace; channel-private entities additionally require current channel membership. |
| PLAT-003 | Every mutation has an authenticated actor, idempotency key where retryable, authorization decision, optimistic version, and append-only audit reference. |
| PLAT-004 | Interactive and background execution use the same capability compiler, action gateway, approval engine, and external-write reconciliation path. |
| PLAT-005 | AG-UI remains the northbound run protocol and TrueForge remains the default harness; product records do not depend on raw provider event schemas. |
| PLAT-006 | Controlled registered GenUI is the default. Generated UI cannot become authoritative state or create authority by rendering a control. |
| PLAT-007 | Deletion, retention, export, legal hold, and source revocation propagate through derived knowledge, memories, artifacts, UI snapshots, and workflow inputs according to explicit policies. |
| PLAT-008 | Hosted and self-hosted editions share the same core data model, migration path, contracts, and security defaults. |
| PLAT-009 | Every public API and extension contract is versioned, documented, migration-tested, and independently permissioned. |
| PLAT-010 | Product parity claims name a tested release and capability matrix; specifications alone never count as parity. |

## Domain specifications

- [Coworkers](./coworkers.md)
- [Skills](./skills.md)
- [Connections and external tools](./connections.md)
- [Files and knowledge](./knowledge.md)
- [Memory](./memory.md)
- [Workspace search and history](./search.md)
- [Experimental open-generated UI](./experimental-ui.md)
- [Workflows, schedules, and triggers](./workflows.md)
- [Structured records](./records.md)
- [Human teams](./teams.md)
- [Notifications and presence](./notifications.md)
- [Retention, deletion, export and classification](./retention.md)
- [Optional advanced orchestration](./advanced-orchestration.md)
- [Architecture and deployment](./architecture.md)
- [Security and privacy](./security.md)
- [Open-source product contract](./open-source.md)
- [UX](./ux.md)
- [Data model](./data-model.md)
- [API contract](./contracts/api.md)
- [Event contract](./contracts/events.md)
- [Verification](./test-plan.md)
- [Requirement traceability](./traceability.md)
- [Competitive parity evidence](./parity.md)

## Parity target

The 0.3 team beta is the first release eligible to be described as comparable in product breadth to the non-computer portions of Kylon, Grok Bot, or OpenBot. That statement requires the tested capabilities below, not merely matching labels:

- Persistent coworkers in shared channels with identity, separate sessions, permission, memory, skills, tasks, and connections.
- Conversational coworker creation and reviewable permission preview.
- Files, URLs, citations, durable scoped memory, and source controls.
- Repeatable skills plus schedules and event triggers with inspectable run history.
- App-owned structured records that agents and humans update through the same governed commands.
- Multiple humans, roles, private channels, approver groups, notifications, and audit access.
- Controlled real-time GenUI over AG-UI, durable artifacts, approvals, and verified external actions.
- A reproducible self-hosted distribution and full data export.

The dated comparator sources, row-by-row evidence and public-claim rules are canonical in the [competitive parity evidence matrix](./parity.md).

## Permanent exclusions

- Hidden autonomous authority inferred from prompts, memory, or prior approvals.
- Arbitrary Composio catalog access without explicit workspace and coworker grants.
- Model-authored approval controls or trusted-system impersonation through GenUI.
- Unscoped cross-workspace memory or knowledge.
- Secret entry through chat or generated UI.
- Browser/desktop takeover and general computer use in releases 0.1 through 1.0.
- Claims that background jobs are exactly-once when the external provider cannot support or reconcile that guarantee.

## Definition of complete

This product specification is complete when each domain has observable requirements, ownership, states, authorization, retention, failure behavior, API/event boundaries, acceptance tests, and mapped implementation tasks. A release is complete only when its tasks and release gate pass with implementation evidence.
