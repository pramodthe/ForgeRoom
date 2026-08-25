# Workflows, schedules, and triggers specification

## Purpose

A workflow is a saved, versioned operating contract for repeatable work. It defines ownership, inputs, steps, conditions, approvals, destinations, failures, and run history. A skill is reusable procedure content and does not schedule itself.

## Objects

| Object | Purpose |
| --- | --- |
| `WorkflowDefinition` | Stable identity, owner, visibility, lifecycle, current version |
| `WorkflowVersion` | Immutable graph/contract, coworker/runtime/skill/schema pins, budgets, policy snapshot references |
| `WorkflowTrigger` | Manual, schedule, webhook/provider event, record transition, or channel command configuration |
| `ScheduleOccurrence` | Unique intended time, timezone, misfire handling, claim/execution state |
| `TriggerDelivery` | Authenticated event envelope, provider ID, dedupe key, match result, retention |
| `TriggerMatch` | One immutable delivery-to-trigger/version evaluation and occurrence/run decision |
| `WorkflowRun` | One durable execution with input snapshot, version, status, budget, actor, destination |
| `WorkflowStepRun` | One coworker/action/record/handoff/condition step and attempts |
| `WorkflowHandoff` | Explicit source/destination channel and coworker, bounded context envelope, and fixed reply route |
| `DeadLetter` | Terminal delivery/run requiring operator or owner decision |

## Creation flow

1. A user starts from a successful manual run/skill or describes a desired repeated outcome.
2. A no-authority builder creates a draft with owning coworker, inputs, skills, data sources, steps, output/destination, trigger, timezone, budgets, concurrency, approvals, no/stale-data behavior, retries, notifications, and stop conditions.
3. The server resolves exact versions and capability requirements and displays a permission/action diff.
4. An authorized user saves an immutable disabled version.
5. **Test run** executes real work under a conspicuous test label and the same approvals; safe fixtures are recommended and side effects are never silently mocked.
6. Enablement requires passing validation, current sources/connections, owner/approver, and compatible skill/runtime/schema versions.

## Trigger types

| Type | Required contract |
| --- | --- |
| Manual | Actor, exact version, validated input, idempotency key |
| Schedule | IANA timezone, recurrence, start/end, DST policy, misfire policy, next occurrence, concurrency policy |
| Webhook/provider event | Auth/signature verification, source/account, allowed event types, narrow filter, dedupe key, replay window |
| Record transition | Record type/schema version, transition/filter, before/after revision IDs, transaction/outbox linkage |
| Channel command | Authorized channel/member/coworker, explicit command, recipient, input schema |

## Run states

```text
queued → running → awaiting_input | awaiting_approval | retry_wait
running → succeeded | partial | failed | cancelled | timed_out
awaiting_input | awaiting_approval → queued | failed | cancelled | timed_out
retry_wait → queued | dead_letter | cancelled
failed → queued (authorized retry from immutable input) | dead_letter
queued | running → cancelled
```

Every transition appends `WorkflowRunTransition`; mutable current state is only a pointer/projection. Wait resolution is compare-and-set and requeues once. Definition states are `draft`, `disabled`, `enabled`, `paused`, `blocked`, `archived`. A workflow becomes `blocked` when a pinned coworker/skill/schema/source/account/policy is missing or incompatible.

## Requirements

| ID | Contract | First release |
| --- | --- | --- |
| WF-001 | A workflow version pins owner, coworker/runtime, skills, input/output schemas, sources, records, steps, destination, budgets, approvals, failures, and trigger contract. | 0.3 |
| WF-002 | Drafting, saving, testing, and enabling are separate actions; builders and models cannot self-enable. | 0.3 |
| WF-003 | Manual, scheduled, webhook/provider, record, and channel triggers enter one authenticated/deduplicated run command path. | 0.3 |
| WF-004 | Schedule uses IANA timezone, explicit DST/misfire/concurrency policies, database time, unique occurrence key, and visible next run. | 0.3 |
| WF-005 | Event triggers verify origin/authenticity, use narrow filters and replay windows, dedupe provider deliveries, and retain match/rejection reason. | 0.3 |
| WF-006 | Every run has immutable input snapshot/reference, exact version pins, state/step history, costs/budgets, outputs, approvals, notifications, and audit lineage. | 0.3 |
| WF-007 | Interactive and unattended runs use the same capability compiler, action gateway, approval binding, provider execution, and reconciliation. | 0.3 |
| WF-008 | Retry classifies transient/permanent/unknown outcomes, is bounded with backoff, respects idempotency/reconciliation, and ends visibly in dead letter. | 0.3 |
| WF-009 | A handoff declares exact destination channel/coworker, authorized context fields, source links, hop count, correlation ID, and reply channel/thread/recipient. | 0.3 |
| WF-010 | Correlation/hop/reentrancy/concurrency limits prevent trigger and channel loops; broad listeners are rejected or require exceptional policy. | 0.3 |
| WF-011 | Owners can pause, resume, disable, test, edit through a new version, cancel queued/active work, rerun from safe input, and inspect history. | 0.3 |
| WF-012 | Grant, connection, schema, skill, source, policy, or coworker revocation blocks affected future runs before TrueForge invocation and notifies owners. | 0.3 |
| WF-013 | Scheduler/trigger failover and recovery do not silently drop or duplicate logical occurrences; ambiguous external effects reconcile or require operator action. | 1.0 |

## Authority and routing invariants

- The immutable workflow version selects exactly one service principal. Triggers and event payloads cannot choose or override the principal, account, channel, coworker, tool or approval policy.
- Each run copies the principal from its exact workflow version and reauthorizes the principal, grants, connections, policy and pinned resources before the run is claimed and before each consequential step.
- A webhook/provider trigger binds one registered endpoint, source/account, event type and schema version. A delivery that does not match that contract is rejected and retained with its reason.
- Authenticated webhook/internal-event ingress is persisted before trigger evaluation; one delivery may match zero, one or many triggers, and each match/deduplication decision is independently replayable.
- Manual run commands bind the authenticated caller, exact version, validated input and idempotency key; repeated commands produce one logical run.
- A handoff binds its destination channel/coworker and reply channel/thread/recipient. Context or provider payload text cannot redirect either route.

## Step types

The first stable step set is closed and typed:

- `coworker_task`: invoke one persistent coworker with bounded input/output.
- `skill_task`: invoke one pinned skill through its coworker.
- `record_command`: run one literal application record command.
- `external_action`: create a governed proposal/action through the gateway.
- `condition`: evaluate a deterministic expression over typed prior outputs.
- `handoff`: create a bounded destination channel message/run.
- `human_input`: wait for a form answer with timeout/escalation.
- `approval`: wait for policy-required decision; it cannot approve its own child action.

Arbitrary model-generated executable workflow graphs and unrestricted loops are excluded. Dynamic planning may occur within a bounded coworker step but cannot add permissions or destinations.

## Scheduling and unattended approvals

- Approval may happen during a run and is bound to exact current arguments, or a narrowly defined pre-authorization policy may allow an effect class/limit. A prior interactive “Allow” click is not blanket future approval.
- Expired approval moves the run to failure/partial according to policy; it does not auto-approve.
- The approval inbox shows workflow, schedule/trigger source, owner, exact action/account/target/effect, data freshness, retries, expiry, and downstream consequences.
- If approval changes input/effect, create a new proposal and re-evaluate the remaining workflow.

## Failure behavior

- No data, stale data, ambiguous match, unavailable connection, schema mismatch, budget exhaustion, missed schedule, duplicate event, partial output, and unknown provider outcome are separate typed states.
- Retry never repeats a non-reconcilable external write automatically.
- A dead letter retains the exact version/input/output/error/reconciliation references and leaves only explicit reconcile, retry-from-snapshot, dismiss or supersede commands; none mutates old attempts.
- Pausing stops new claims; active safe points finish or cancel according to step policy.
- Editing creates a new version for future runs. Active runs remain pinned unless an authorized migration/cancel is explicit.
- Deleted destination/source creates a blocked run, not a fallback to another channel/account.

## Acceptance scenarios

- Schedule a daily read/analyze/post-record workflow across a DST change; one occurrence runs with the expected local time and unique key.
- Deliver the same signed webhook twice; one WorkflowRun is created and both deliveries are visible.
- A workflow proposes an external write, waits for exact approval after the initiating user is offline, then verifies the provider result.
- Revoke a skill/account before the next occurrence; the run blocks before model/tool use and notifies its owner.
- Configure a handoff that could trigger its source workflow; correlation/hop policy stops the loop and records why.
- Crash a worker after an uncertain write; recovery reconciles or dead-letters without blindly executing again.
