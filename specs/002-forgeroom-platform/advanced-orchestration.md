# Optional advanced orchestration specification

## Purpose and release status

Direct `@coworker` and `@team` routing remains the required product path. Coordinator planning and TrueForge native subagents are optional 0.2 experiments: they are disabled by default, do not gate the private alpha, and cannot be used in parity claims until their own conformance evidence passes.

Persistent coworkers are channel members with application-owned identity, permissions, memory, skills, sessions and history. A native subagent is an ephemeral child created inside one persistent coworker's TrueForge turn and never becomes a channel member.

## Coordinator contract

```text
human message
→ direct deterministic recipient set
→ optional coordinator creates bounded DispatchPlan
→ server validates every assignment and capability
→ independent child RunSteps execute
→ optional synthesis waits for true terminality
```

The coordinator receives only authorized channel context and a server-authored roster. Its plan is untrusted structured data. It cannot add coworkers, change permissions, choose accounts/tools, recurse, approve work, or hide individual child results.

## Native-subagent contract

The parent persistent coworker owns the child objective, context, budget and effective authority ceiling. Application events preserve parent coworker, logical thread, AgentTurn, TrueForge child-thread and tool/approval lineage without exposing raw provider identifiers. Child identity shown in UI is server-derived; model-authored names are labels only.

## Requirements

| ID | Contract | First release |
| --- | --- | --- |
| AOR-001 | Coordinator mode is explicit per channel/run, disabled by default, and direct routing continues to work without it. | 0.2 optional |
| AOR-002 | `DispatchPlanV1` is closed, versioned and bounded to configured channel-member assignments with typed objectives/outputs/budgets. | 0.2 optional |
| AOR-003 | The server rejects unknown, disabled, non-member, cross-channel, recursive, duplicate and over-budget assignments before creating child steps. | 0.2 optional |
| AOR-004 | Planning permits at most one bounded repair; failure is visible and never falls back to ambient recipients or authority. | 0.2 optional |
| AOR-005 | Synthesis is optional, source-links each child result and waits until every child is terminal with no unresolved action/question/component interrupt. | 0.2 optional |
| AOR-006 | Without synthesis, each child result remains independently visible and attributable; synthesis cannot rewrite its audit history. | 0.2 optional |
| AOR-007 | A native subagent is ephemeral internal work under exactly one persistent parent coworker and never appears in channel membership. | 0.2 optional |
| AOR-008 | Child context, tools, skills, budget, sandbox and approvals are a non-expanding subset of the parent's current compiled authority. | 0.2 optional |
| AOR-009 | Start/progress/tool/approval/result/failure events retain stable parent/child lineage through normalized application and AG-UI metadata. | 0.2 optional |
| AOR-010 | Child tool actions use the same policy, proposal, approval, execution, reconciliation and audit gateway as parent work. | 0.2 optional |
| AOR-011 | UI identity and attribution come from server-held lineage, never model-authored names or raw TrueForge IDs. | 0.2 optional |
| AOR-012 | Stop, timeout, parent failure/session rotation and replay produce a deterministic child terminal projection without orphaned authority. | 0.2 optional |

## Acceptance scenarios

- A plan names a coworker outside the channel; the whole invalid assignment is rejected with no child RunStep.
- One child is complete while another awaits approval; synthesis does not start and both states survive refresh.
- A native child requests a tool outside the parent ceiling; no proposal or provider call is created.
- The same child events replay after reconnect into one identical nested activity group without making the child a participant.
