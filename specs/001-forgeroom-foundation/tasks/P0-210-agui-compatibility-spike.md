---
id: P0-210
title: Freeze pure AG-UI versions, evaluate optional CopilotKit, and prove the TrueForge bridge
status: blocked
owner: unassigned
depends_on: [P0-000, P0-101]
requirements: [AGUI-001, AGUI-003, AGUI-009]
specs: [../contracts/ag-ui.md#version-profile, ../generative-ui.md]
adrs: [ADR-006, ADR-007]
touches: [package.json, packages/integrations/ag-ui, packages/test-fixtures]
---

# P0-210 — Freeze pure AG-UI versions, evaluate optional CopilotKit, and prove the TrueForge bridge

## Outcome

One exact package matrix and executable spike proves TrueForge can drive standard AG-UI plus frontend component tools without replacing TrueForge as the harness.

## Acceptance criteria

- [ ] Record exact `@ag-ui/core`/client baseline and every actually enabled CopilotKit package; disabled CopilotKit runtime is absent from the server graph.
- [ ] Prove/select the pure AG-UI 0.0.57 baseline, reproduce and reject the known `@copilotkit/runtime@1.69.0` split (client 0.0.57 direct versus 0.0.54 through MCP middleware), and keep the optional gateway disabled unless a future coherent graph independently passes.
- [ ] Full transitive lockfile and package-manager inspection prove one resolved copy of each AG-UI core/client package; no forced override, hidden duplicate, dependency exclusion or stable/canary mixture is allowed.
- [ ] An official AG-UI client parses a fixture-backed TrueForge text/tool/activity/interrupt stream under test-session authentication; production session/auth integration belongs to P0-211.
- [ ] Official `@ag-ui/client` runs the application Hono/SSE adapter with session cookie, current CSRF header and expected Origin; missing/forged CSRF fails. Reproduce the CopilotKit split and leave `/api/copilotkit` disabled unless a separate coherent graph passes identical tests.
- [ ] Prove the application-owned AG-UI/React tool bridge can offer one typed frontend component to TrueForge and return its result without `@copilotkit/runtime`; any optional CopilotKit hook path must prove parity.
- [ ] Test the preferred private application MCP `ui_components_v1`; if rejected, amend ADR-006 with an equivalently durable mechanism.
- [ ] Prove a noninteractive component call persists/finishes with the browser disconnected; prove an interactive UIComponentInterrupt survives reconnect and creates one structured continuation rather than a PauseGroup resume.
- [ ] Prove one logical user turn may span multiple wire runs without being marked complete early.
- [ ] Prove native-subagent events and open-generated UI inputs fail closed with typed unsupported-capability events in the P0 feature profile.
- [ ] Record the later-release migration seams for native-subagent activities and open-generated UI without loading either runtime in P0.
- [ ] Startup rejects incompatible/mixed package profiles.

## Verification

Run the compatibility fixture, official-client parser, component-tool round trip and interrupt continuation. Attach the version matrix and redacted event trace.
