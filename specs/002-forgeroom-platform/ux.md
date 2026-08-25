# Startup product UX specification

## Experience goal

The product should feel like a calm shared workplace, not an agent debugger. Users always know who is working, what source or record is authoritative, what can act, what needs them, and what will persist after the conversation scrolls away.

## Information architecture

Desktop navigation:

```text
Workspace
├── Inbox
├── Search
├── Channels
├── Tasks & Records
├── Coworkers
├── Knowledge
├── Memory
├── Skills
├── Workflows
├── Connections
└── Settings
    ├── People & access
    ├── Policies & approvals
    ├── Components & extensions
    ├── Audit & exports
    └── Operations
```

Release 0.1 shows only Channels, Tasks, Coworkers, Skills, Connections, and Settings. Unimplemented destinations are absent, not disabled marketing shells.

## Channel workroom

The channel remains the main surface:

- Left: workspace/channel navigation and unread/needs-you state.
- Center: human/coworker messages, attributed activity, controlled GenUI, Task/record cards, artifacts, approvals, questions, and handoffs in one sequence.
- Right: Work, Records, Artifacts, Sources, Context, and Run detail tabs appropriate to the selected item.
- Header: humans/coworkers, privacy, active work, channel settings.
- Composer: attachments, recipients, task/skill shortcuts, clear acting identity and exact-recipient preview.

Human messages, persistent coworkers, native TrueForge subagents, workflows, and system records have distinct but restrained identity. Debug event names, raw provider JSON, chain-of-thought, credentials, and internal hashes stay out of the primary view; safe technical detail belongs in inspectable receipts.

## Conversational coworker creation

**New coworker** opens a dedicated conversational builder with:

1. Natural-language job prompt.
2. Review card for identity/job/instructions.
3. Permission sections for data, tools/accounts, skills, records, channels, sandbox/GenUI, budgets, and approvals.
4. Clear read/write/destructive badges, denied-request reasons, data-leaving-workspace notice, and permission diff on edits.
5. **Create coworker** in trusted host UI, bound to the visible draft revision.
6. Provisioning state and a safe test-message option.

An ordinary channel request may open a prefilled builder, but never shows a coworker/model message as the authoritative create confirmation.

## Controlled GenUI

Release 0.1 uses a deliberately small polished component set:

- Data table.
- One bar/line chart family with accessible table fallback.
- Task card/list.
- Artifact/image card.
- Choice/filter form.

Components stream through AG-UI, use application theme/layout, show source/freshness, persist exact state, and replay after refresh. A filter changes a view or resolves its exact component question; it cannot approve, resume unrelated work, call an external tool, or mutate a record without a separately authorized command.

The open-generated iframe rail is absent in 0.1. In 0.2 experimental builds it is permanently labeled generated/untrusted and isolated from trusted approval/system chrome.

## Domain surfaces

### Tasks and records

List/board/detail views show status, assignee, channel, source Run, due date, latest revision, provenance, and history. Human edits and agent-proposed diffs use the same validated command language. GenUI projections link back to the canonical record.

### Skills

The 0.1 Run menu offers **Save as skill**, opening a review of method, inputs, tools, validation, output, failures, and approvals before publish/attach. The alpha adds catalogue filters, version diff, test evidence, bindings, import/export, and deprecation.

### Connections

Connection cards show application, ownership class, safe acting account, scopes, exact enabled tools/effects, health, last verification and affected coworkers/workflows. **Connect**, **Reconnect**, **Grant tools**, **Disable** and **Revoke** are trusted revision-bound flows. Tool browsing is searchable and effect-labelled but selects nothing by default. OAuth callback, missing-scope, identity-change, descriptor-drift, provider-outage and revoke-in-flight states explain what remains blocked and never suggest a fallback account.

### Knowledge

Upload chips show progress/scanning/extraction/indexing/ready/failure. The source page shows versions, scope, freshness, parser warnings, citations, derivatives, and deletion impact. Citations open exact page/row/line/path when authorized.

### Search and history

Global search is keyboard-first and returns typed cards for authorized messages, records, coworkers, sources, skills, memories, Runs and artifacts. Filters, facets and snippets never reveal inaccessible scope. Run results open a safe history view joining request, steps, tools, approvals, records, artifacts, skill versions and receipt. Index lag/unavailable, revoked result and unsupported-version states are explicit.

### Memory

Memory review shows proposals, exact scope, sources, expiry, conflicts, last use, affected coworkers, and revision diff. “Why known?” opens sources and the exact memory revision without exposing inaccessible content.

### Workflows

Draft review combines a readable step list/graph with owner, version pins, trigger/schedule, input/output, destination, data/tools, approvals, budgets, retries, no/stale-data behavior, and next occurrences. Test, Enable, Pause, Edit, and Run history are distinct actions.

### People, inbox, approvals

People & access explains roles/groups/private channels and shows impact before removal. Inbox groups items needing attention. Approval UI is trusted host chrome and shows exact effect, sources, freshness, account, policy, workflow/run lineage, expiry, and approver rule.

### Audit, retention and portability

**Audit & exports** provides authorization-filtered event search, resource/actor/action/time filters, checkpoint integrity state and asynchronous export jobs with expiry. A failed integrity check is a prominent security state, never a quiet empty result.

**Retention & deletion** shows the active profile/version, per-domain defaults, configured overrides, backup/external-retention disclosures and destructive-action impact. Authorized users can inspect deletion propagation status and failed stores without seeing secret object keys or deleted content. Legal hold creation/release requires recent authentication, exact scope/reason/expiry review and a permanent audit reference; held resources remain hidden after access revocation.

**Portable export/import** previews included/omitted domains, permissions, redactions, paused workflows, connections requiring reauthorization, ID/conflict policy and integrity manifest before commit. Import never enables automation or broadens visibility silently. These surfaces ship in 0.2; users without relevant owner/admin authority do not see counts, names or job existence.

## Visual system

- Dense enough for operational work, with 8-point spacing and readable 14–16 px body text.
- Neutral surfaces with one accent, semantic status colors, and color-independent icons/text.
- Coworkers have stable avatar/accent identity; activity lanes do not become a rainbow dashboard.
- Rich cards align to the message column and expand into side-panel detail rather than overwhelming the conversation.
- Loading uses named phases and useful skeletons; no fake progress percentage unless the backend reports bounded work.
- Empty states teach one concrete action using real product language.

## Required states

Every screen/component specifies and tests: loading, empty, ready, stale, permission denied, unavailable source/account, partial, conflict, awaiting human, paused, retrying, failed, revoked/deleted, offline/reconnecting, and unsupported-version fallback as relevant.

## Accessibility

- Full keyboard operation, visible focus, landmarks/headings, accessible names/descriptions/errors, and logical focus restore.
- Charts have tabular summaries; boards have list equivalents; timelines expose ordered text; images have useful alt text or explicit decorative status.
- Streaming announcements are throttled and do not read token-by-token.
- Motion respects reduced-motion; contrast meets WCAG AA; status is not color-only.
- Generated/third-party UI never traps focus or impersonates trusted system controls.

## Responsive behavior

Desktop is the primary authoring/operations surface. Tablet collapses the right panel into a drawer. Mobile supports channel reading/posting, questions, approvals, inbox, Task updates, and workflow pause; complex builder/schema/workflow authoring may direct users to desktop without hiding urgent state.

## UX acceptance

- A new user can create a read-only coworker and correctly explain its exact authority from the preview.
- During a two-coworker run, attribution and current state remain understandable without opening debug details.
- A user can distinguish Message, Task, Run, Artifact, Skill, Memory, Knowledge source and Connection and navigate between their provenance/authority links.
- Refresh during a chart interaction and approval returns to the exact visible state.
- A keyboard/screen-reader user can create a Task, use the filter, inspect sources, answer a question, and approve/deny with the same information.
- An authorized owner can verify an audit checkpoint, understand a deletion/hold impact and review a portable import permission diff without inaccessible content leaking.
