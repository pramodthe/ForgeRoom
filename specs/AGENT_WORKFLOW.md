# Spec-driven coding-agent workflow

This is the operating contract for vibe coding ForgeRoom without drifting away from the product or its safety boundaries.

## 1. Orient

Before editing code, read:

1. `specs/README.md`.
2. The selected task in `tasks/`.
3. Every canonical spec and ADR linked by that task.
4. The release `STATUS.md`, platform `roadmap.md` and dependency tasks.
5. Existing code and tests in the affected area.

Do not infer a missing provider slug, schema, account ID, security behavior, or TrueForge event shape. Treat it as a blocker or complete the named discovery task first.

## 2. Claim one bounded task

- Change the task state from `ready` to `in_progress`.
- Add owner and start date.
- Work on one task unless two tasks are explicitly marked as an atomic pair.
- Do not edit another owner's in-progress task or overwrite unrelated workspace changes.

## 3. Restate the contract

In the task work log, record:

- Intended outcome.
- Files or components expected to change.
- Requirements being satisfied.
- Explicit non-goals.
- Verification that will prove completion.

If implementation would change the contract, stop and use `templates/SPEC_CHANGE_TEMPLATE.md`. Do not quietly reinterpret the spec in code.

## 4. Implement the smallest complete vertical slice

- Preserve the channel-first product model.
- Keep persistent coworkers separate from TrueForge native subagents; P0 compiles native subagents off.
- Keep one TrueForge session per channel and persistent coworker.
- Keep the application database authoritative for channel state.
- Expose only literal, pinned Composio direct tools.
- Never weaken approval, account-pinning, session-rotation, or sandbox-egress controls to make a demo pass.
- Prefer typed domain objects and normalized events over provider payloads in the UI.
- Use AG-UI as the northbound agent/frontend protocol; never add a second raw TrueForge browser stream.
- Keep persistent coworkers as top-level logical threads. Temporary TrueForge children become nested activities only after P1-209 passes; unexpected P0 child events fail closed.
- Treat frontend tool advertisements, component props, generated source and iframe messages as untrusted.
- Recheck component publication/version/grants at call time and keep render, data and action authority separate.
- Never render model HTML in the host DOM or move canonical approval controls inside generated UI.
- Add tests with the implementation, not afterward.

## 5. Verify proportionally

Run the task's required commands. At minimum:

- Format and static checks for changed packages.
- Unit tests for changed domain behavior.
- Integration tests when database, queue, TrueForge, Composio, or sandbox behavior changes.
- The relevant security acceptance test for any auth, grant, approval, connector, artifact, or external-write change.
- Visual verification for UI work at the specified desktop viewport and required states.

Never mark a provider-backed scenario passed using a mocked screenshot. Label recorded or fallback data clearly.

## 6. Attach evidence

Update the task file with:

- Files changed.
- Commands run and results.
- Test names or artifact paths.
- Screenshots for visual changes.
- Provider receipt or redacted trace for real integration checks.
- Known limitations and newly created follow-up task IDs.

Evidence must contain no credentials, raw OAuth headers, private model reasoning, sensitive fixture values, or unredacted external payloads.

## 7. Handoff

Move the task to `in_review` and provide:

~~~text
Task: PX-___
Outcome: <one sentence>
Requirements: <IDs>
Changed: <files/components>
Verified: <commands and checks>
Evidence: <paths or redacted references>
Open risks: <none or explicit items>
Next unblocked tasks: <IDs>
~~~

The reviewer moves it to `done` only after independently checking acceptance criteria and required evidence.

## Anti-drift rules

- The demo scenario is not the product domain. Do not add issue-, tutorial-, research-, or operations-specific columns to core tables.
- Coordinator, Researcher, and Operator are fixture roles, not hardcoded classes.
- Composio catalog breadth does not imply ambient access. New tools require grants, a new session revision, and a reviewed policy adapter for writes.
- A `turn.done` containing required actions does not complete its RunStep.
- A paused TrueForge turn is complete at the turn level; its session remains gated to one atomic response-only resume.
- A model may propose an unsafe action. Prompts do not replace server authorization or immutable approval binding.
- A single application resume is not a generic exactly-once provider guarantee.
- Open Daytona network egress means only synthetic or public data may enter the sandbox.
- Raw provider events, reasoning, credentials, and arbitrary tool bodies do not belong in application persistence.
- `RUN_FINISHED` ends an AG-UI wire run, not necessarily the logical turn or application RunStep.
- Component names and client-provided schemas are not grants.
- P0 registers only the fixed controlled GenUI rail. It has no `generate_open_ui`, `iframe_v1`, generated origin, source assembler or render-capability endpoint; unexpected input is inert and unsupported.
- P1-317/P1-506 preserve the private declarative iframe design. Do not partially enable it or substitute model-authored JavaScript; its task/spec/security suite is authoritative when that experimental work begins.
- CoworkerDraft builder output is an untrusted request. Only server-resolved exact permissions plus a revision-bound human confirmation may provision a coworker.
- Application-owned Tasks/records—not chat prose or pixels—are canonical business state.
- A saved skill is versioned procedure, not authority. Binding it must intersect current tools, accounts, data, component and approval grants.
- Only the separately gated P1 iframe experiment may add a host-confirmed agent-turn challenge flow. P0 has no confirmation endpoint or `request_agent_turn` mode.
- Refresh must verify and replay the same canonical channel, Task/record, artifact, approval, audit and controlled UI revisions without asking the model to regenerate them.
- P1+ knowledge and memory must retain source revisions and explain why a coworker knows a fact; missing sources stay visible.
- P2 workflows, schedules, event triggers and handoffs use the same action/approval gateways as interactive work and add no unattended bypass.

## When to pause and ask

Stop implementation when:

- A Phase 0 provider/tool decision is missing.
- Two canonical specs conflict.
- A task requires destructive external data changes not explicitly included in the fixture.
- A provider schema differs from its checked-in descriptor hash.
- The only available shortcut would bypass an approval, grant, account pin, session rotation, authentication control, or safety test.
- The workspace contains overlapping uncommitted user changes that cannot be preserved safely.
