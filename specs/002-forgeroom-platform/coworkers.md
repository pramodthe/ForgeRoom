# Coworker lifecycle specification

## Purpose

A coworker is a durable workspace member backed by a versioned ForgeRoom profile and a compiled TrueForge agent manifest. Natural language makes creation approachable; a trusted review-and-confirm boundary makes it safe.

## Core objects

| Object | Purpose |
| --- | --- |
| `Coworker` | Stable identity, owner, visibility, lifecycle, avatar, and current version pointer |
| `CoworkerVersion` | Immutable job, instructions, model preset, budgets, runtime toggles, and declared capability requests |
| `CoworkerDraft` | Immutable proposed version plus server-resolved permission preview and validation results |
| `CoworkerGrant` | Positive workspace/channel/resource permission granted to a version |
| `CoworkerChannelMembership` | Roster membership and optional channel-specific restriction |
| `RuntimeRevision` | Exact compiled TrueForge manifest, tools, skills, accounts, policies, and hashes used by sessions |

## Conversational creation

The trusted **New coworker** experience accepts a request such as:

> Create a Research coworker that can read GitHub and web data but cannot modify anything.

Flow:

1. The user opens the application-owned Coworker Builder and enters a job description.
2. A dedicated builder path with no external tools returns `CoworkerDraftProposalV1` through strict structured output.
3. The server treats every proposed name as an untrusted request, resolves literal model/tool/skill/account/component/channel IDs, applies workspace policy and the creator's delegation ceiling, and creates an immutable draft revision.
4. The UI displays identity, standing instructions, model, estimated budgets, sandbox/subagent/GenUI toggles, channels, knowledge/memory/record scopes, skills, exact tools, exact accounts, read/write effect, approval rules, and every denied or unavailable request with reason.
5. The user edits through a new draft revision or confirms the exact displayed revision. Confirmation never accepts client-supplied effective grants.
6. The application transactionally creates the coworker/profile/version/grants/membership/provision command, then the worker creates the saved TrueForge agent/runtime session. Provision failure is visible and retryable without duplicate identity.
7. The coworker becomes `active` only after the compiled manifest and live TrueForge definition match expected hashes.

Typing a similar sentence into an ordinary channel does not silently create a member. It may open or link to a prefilled trusted builder, preserving clear system-versus-coworker identity.

## Draft schema

`CoworkerDraftProposalV1` contains requests, not authority:

```ts
type CoworkerDraftProposalV1 = {
  displayName: string;
  title: string;
  job: string;
  instructions: string;
  modelPresetName?: string;
  requestedChannels: string[];
  requestedSkills: string[];
  requestedConnections: Array<{ connector: string; effects: Array<"read" | "write" | "destructive"> }>;
  requestedKnowledgeScopes: string[];
  requestedMemoryScopes: string[];
  requestedRecordCapabilities: string[];
  approvalIntent: "read_only" | "approve_writes" | "approve_all_tools";
  sandboxRequested: boolean;
  nativeSubagentsRequested: boolean;
  generativeUiRequested: boolean;
};
```

The server-produced draft adds stable IDs, exact tool slugs, pinned account IDs/redacted labels, skill versions, component versions, budgets, effective effects, approval rules, denial reasons, policy revision, catalogue revision, draft content hash, expiry, and optimistic revision.

## Lifecycle

```text
draft → pending_confirmation → provisioning → active
  ↘ expired                    ↘ failed_provisioning → provisioning
active → disabled → active
active|disabled → archived
archived → active (restore) | deleted (retention-gated tombstone)
```

- `draft` and `pending_confirmation` have no execution authority.
- `provisioning` cannot receive channel assignments.
- `disabled` remains visible, preserves history, and blocks new runs/schedules.
- `archived` accepts only restore/delete policy commands.
- Deletion never rewrites historical message, record, approval, or audit attribution; it replaces profile display fields according to retention policy.

## Editing and versions

- Any instruction, model, skill, connection, tool, component, budget, memory, knowledge, record, sandbox, or approval change creates a new `CoworkerVersion` and `RuntimeRevision`.
- Capability reduction blocks the queue, cancels when required, stales affected proposals, rotates sessions, then resumes eligible work.
- Capability expansion requires an authorized confirmer and never reuses old sessions before rotation.
- Duplicate creates a draft from a version but copies no conversation, memory, private channel membership, user connection, or pending workflow unless separately selected and authorized.
- Rollback creates a new version from an old one; immutable version history is never moved backward.

## Requirements

| ID | Contract | First release |
| --- | --- | --- |
| CW-001 | A natural-language job description produces a schema-valid immutable `CoworkerDraft`, never an active coworker. | 0.1 |
| CW-002 | Server resolution shows exact model, tools, accounts, skills, components, channels, sources, memory, records, budgets, and approval policies plus every denial reason. | 0.1 |
| CW-003 | Confirm binds actor, workspace, draft revision/hash, policy/catalogue revision, and expiry; stale confirmation fails closed. | 0.1 |
| CW-004 | Creation and provisioning are idempotent and expose pending/failed/active state. | 0.1 |
| CW-005 | The builder has no external tools and its output cannot grant capabilities or bypass server validation. | 0.1 |
| CW-006 | Effective authority is the intersection of current workspace, confirmer, coworker, channel, connection, skill, source, record, workflow, and policy grants. | 0.1 |
| CW-007 | Every capability-affecting edit creates immutable versions and rotates affected sessions before new work. | 0.1 |
| CW-008 | Owners can disable, archive, restore, duplicate, transfer ownership, and inspect version/audit history subject to policy. | 0.2 |
| CW-009 | A coworker has reviewable work, memory, skill, connection, channel, workflow, and record views; no hidden configuration exists only in prompts. | 0.2 |
| CW-010 | Workspace templates may prefill drafts but cannot carry account IDs or grants into a workspace without fresh resolution and confirmation. | 0.2 |
| CW-011 | Coworker visibility and delegation respect human team roles, private channels, and groups. | 0.2 |
| CW-012 | A disabled/deleted coworker cannot run schedules, consume trigger events, approve, or receive a handoff. | 0.3 |

## Authorization

- Members may draft within policy; only `coworker.create` holders confirm.
- A confirmer may delegate only permissions they are allowed to grant. Owning a connection does not automatically permit delegation.
- User-owned connections require the owner or an explicit delegator; workspace service accounts require admin policy.
- Channel managers control roster membership; private-channel existence is not disclosed to an unauthorized draft creator.
- Coworkers cannot create persistent coworkers directly. They may propose a draft for human confirmation if granted `coworker.propose`.

## Failure behavior

- Unknown or drifted models/tools/skills/accounts/components are listed as unavailable; the server never substitutes a broader item.
- If policy/catalogue/account state changes after preview, confirmation returns `409 stale_draft` and a new diff.
- TrueForge create timeout leaves `provisioning` or `failed_provisioning`; reconciliation checks the idempotency key/name before retry.
- A partial database create rolls back. A remote agent created without a committed coworker is quarantined and cleaned by reconciliation.
- Builder text that attempts prompt injection is retained only as user input/source; it cannot alter the builder system schema or server grants.

## Acceptance scenarios

- A read-only GitHub researcher draft shows literal read tools and denies every write/destructive tool; confirmation creates a coworker whose live manifest matches.
- A user requesting an account they cannot delegate sees a denial without learning secret identifiers.
- Two concurrent confirmations of one draft create one coworker.
- Confirmation after a grant revocation fails and displays a new permission diff.
- Disabling a coworker prevents interactive, scheduled, and trigger work while its prior channel messages remain correctly attributed.
