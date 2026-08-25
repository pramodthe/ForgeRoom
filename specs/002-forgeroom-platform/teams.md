# Human teams and authorization specification

## Purpose

ForgeRoom is a shared workspace. Human collaboration must have explicit identity, membership, roles, private-channel controls, delegated connection authority, approver groups, presence, notifications, and offboarding.

## Objects

| Object | Purpose |
| --- | --- |
| `User` | Stable human identity; no workspace authority by itself |
| `WorkspaceMembership` | User/workspace status, base role, lifecycle, preferences |
| `Role` / `RoleBinding` | Versioned capability set and scoped assignment |
| `Group` / `GroupMembership` | Team/approver grouping and scoped policy subject |
| `Invitation` | Expiring, single-purpose invite with intended workspace role |
| `ChannelMembership` | Channel visibility/role/notification state for a human or coworker |
| `ConnectionDelegation` | Exact account/tool/effect/use scope a user or admin delegates |
| `Notification` | Deduplicated user-visible event with reason, resource, delivery state |
| `PresenceLease` | Ephemeral online/viewing/typing projection, never authorization |

## Base roles

Roles compile to named capabilities; route code never relies only on display labels.

| Role | Default scope |
| --- | --- |
| Owner (0.2) | Workspace administration, ownership transfer, policy, destructive workspace operations |
| Admin (0.2) | Members, coworkers, connections, skills, knowledge, records, workflows, audit subject to owner-only exceptions |
| Member (0.2) | Create/collaborate in permitted channels, sources, records, runs, and drafts |
| Approver (0.3) | Decide explicitly assigned proposal classes/resources; no implied edit/admin authority |
| Viewer (0.3) | Read permitted channels/resources; no run/mutation authority |
| Operator (0.3) | Runtime/workflow health, retry/dead-letter/backup actions without content access beyond required safe metadata |

Custom roles are 0.3+. Owner is a protected capability bundle, not merely another editable role.

## Membership lifecycle

```text
invited → active → suspended → active
invited → expired | revoked
active|suspended → removed
```

- Invite acceptance requires intended identity/domain policy and current invitation revision.
- Suspension immediately invalidates product sessions and blocks new API/event/download capabilities.
- Removal revokes workspace/channel/group/role bindings, personal connection delegations, pending approval ability, and future notification delivery.
- Historical messages, approvals, record revisions, and audit keep attributed immutable user IDs with retention-safe display.
- The last owner cannot leave/remove themselves until ownership transfers or the workspace is explicitly deleted.

## Requirements

| ID | Contract | First release |
| --- | --- | --- |
| TEAM-001 | Every request resolves authenticated user, active workspace membership, scoped roles/groups, channel membership, and resource grants server-side. | 0.2 |
| TEAM-002 | Invitations are expiring, revocable, single-use, intended-recipient-bound, role-bounded, and audited. | 0.2 |
| TEAM-003 | Owner/admin/member capabilities are documented and tested; role labels alone confer nothing. | 0.2 |
| TEAM-004 | Private channel names, membership, messages, coworkers, sources, records, memory, notifications, and search results are not disclosed to non-members. | 0.2 |
| TEAM-005 | Membership suspension/removal revokes sessions and future authority promptly without losing historical attribution. | 0.2 |
| TEAM-006 | Concurrent human commands use idempotency and optimistic revision; conflicts are explicit and do not overwrite another decision/edit. | 0.2 |
| TEAM-007 | Presence/typing/viewing are ephemeral hints and never grant access or prove approval identity. | 0.2 |
| TEAM-008 | Notifications are preference-aware, deduplicated, source-linked, permission-checked at delivery/open, and contain no forbidden private payload. | 0.2 |
| TEAM-009 | Approver/viewer/operator bundles, groups and scoped custom roles support channel managers, coworker owners, workflow owners, knowledge curators, record editors and approver sets. | 0.3 |
| TEAM-010 | Approval policy supports one-of, all-of, threshold, separation-of-duties, escalation, expiry, and delegation with exact proposal binding. | 0.3 |
| TEAM-011 | User-owned connections stay owned by that user and require explicit tool/effect/coworker/workflow delegation; removal never falls back to another account. | 0.3 |
| TEAM-012 | Workspace export, audit, retention, legal hold, and destructive administration are separately permissioned and require recent authentication where configured. | 1.0 |

## Authorization evaluation

Effective permission is an intersection, never a union inferred from context:

```text
active identity/session
∩ workspace membership/role/group
∩ channel/resource membership
∩ object grant and visibility
∩ current policy and retention status
∩ delegation ceiling/connection owner
∩ action-specific approval rule
```

Deny, suspension, revocation, quarantine, legal deletion, and stale policy states take precedence. Lists/search/counts apply the same filters as direct object reads.

## Approver groups and separation

- A proposal stores the required policy revision and approver rule at creation; current eligibility is rechecked at decision.
- The proposer/coworker/executor cannot satisfy a human approver slot.
- Policies may forbid the human who created a workflow or record change from being its only approver.
- One decision record belongs to one proposal/pause group. A group decision is a set of individually authenticated decisions, not a shared button token.
- Membership changes stale or re-evaluate pending approval according to the policy snapshot; they never silently transfer a decision.

## Notifications and presence

Notification types include mentions, assignments, questions, approvals, workflow failures, connection expiry, source/memory conflicts, skill/schema drift, and security events. Each has severity, dedupe key, resource link, safe preview, read state, and delivery attempts. Email/push adapters receive the minimum safe payload.

Presence uses authenticated channel/client-session leases with a server-capped 60-second TTL, closed coarse online/viewing/typing state, rate-limited heartbeats and an invisible mode that emits no projection. The server removes projections on membership/session revocation, realtime close, explicit release or expiry. Presence is ephemeral realtime data—not a DomainEvent, audit decision or permission signal. Offline status does not stop workflows; it may change escalation/notification behavior.

## Acceptance scenarios

- Invite a member to one private channel; search and direct-ID requests reveal no other private channel or source.
- Remove an approver while a proposal is pending; their old session cannot decide and the policy shows remaining requirements.
- Two owners concurrently edit a coworker; one update succeeds, the other receives a revision conflict and diff.
- Remove a user who delegated a personal connection; future runs block with that exact account unavailable and never select a workspace account.
- An email notification is generated for a private approval but contains only safe workspace/action metadata; opening rechecks current membership.
