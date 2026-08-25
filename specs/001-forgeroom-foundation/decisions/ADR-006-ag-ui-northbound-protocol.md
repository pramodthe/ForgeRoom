# ADR-006 — Use AG-UI as the northbound agent-to-frontend protocol

| Field | Value |
| --- | --- |
| Status | Accepted |
| Date | 2026-08-25 |
| Decision owners | Product and runtime |

## Context

The original draft normalized TrueForge events into an application-specific SSE contract. That supported replay but omitted a core product capability: an agentic frontend that can exchange messages, tool calls, shared state, activities and interactive generative UI with agents through a standard protocol.

TrueForge is the required execution harness but is not the browser-facing AG-UI endpoint. ForgeRoom also needs multiple persistent coworkers, durable channel history and application-owned authorization, none of which should be delegated to a frontend SDK.

## Decision

ForgeRoom will implement a server-side `TrueForgeAGUIAdapter` and use AG-UI as the canonical northbound runtime contract.

- A standard authenticated per-channel-coworker run endpoint accepts `RunAgentInput` and returns AG-UI SSE; each persistent coworker owns a stable logical thread.
- The durable channel stream multiplexes per-coworker AG-UI event envelopes with a monotonic application sequence.
- Stable core AG-UI messages, tool calls, state and activity events are used directly.
- Application-specific semantics use versioned metadata and `ACTIVITY_*`, not raw provider events.
- P0 compiles TrueForge temporary child threads off and safely rejects unexpected child events; P1-209 may add a namespaced/native activity mapping after its lineage and security gate.
- AG-UI run completion never overrides application/TrueForge required-action state.
- The exact compatible pure `@ag-ui/*` versions are pinned and conformance-tested before feature work. CopilotKit runtime is optional and remains absent unless a coherent single-line graph passes the same parity suite.

## Consequences

Positive:

- OpenBot-like component tools, shared state, HITL and generated UI fit one explicit transport.
- The frontend is not coupled to raw TrueForge event names.
- Other AG-UI clients can exercise the run endpoint.
- TrueForge remains the agent harness and security policies remain application-owned.

Costs:

- The adapter must reconcile four lifecycles: channel Run, RunStep, TrueForge turn and AG-UI run.
- Durable multi-coworker replay is an application extension around standard AG-UI events.
- Package compatibility and event-order conformance become release gates.
- Current stable and protocol-main subagent/interrupt features may differ, requiring a temporary activity fallback.

## Rejected alternatives

- **Raw TrueForge events in React:** couples the UI to provider internals and does not establish AG-UI interoperability.
- **Custom channel SSE only:** preserves replay but omits a standard bidirectional agent/frontend runtime.
- **Replace TrueForge with CopilotKit:** violates the product/hackathon requirement; CopilotKit may optionally provide parity-proven frontend/runtime plumbing but cannot replace the harness or gate the pure AG-UI path.
- **Treat every persistent coworker as a native AG-UI subagent:** loses the application-owned participant, permission and session model.

## Verification

P0-210 must publish a version matrix, golden stream fixtures, an official-client parse test, TrueForge-to-AG-UI mapping tests and a reconnect proof before dependent UI work starts.
