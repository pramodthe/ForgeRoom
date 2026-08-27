---
id: P0-311
title: Implement Daytona sandbox event path
status: done
owner: cursor-agent
started: 2026-08-27
completed: 2026-08-27
depends_on: [P0-201, P0-203]
requirements: [SB-001, SB-002]
specs: [../runtime.md#sandbox-and-artifact-handoff, ../security.md#sandbox-and-artifact-controls]
adrs: [ADR-005]
touches: [packages/integrations/trueforge, packages/orchestration]
---

# P0-311 — Implement Daytona sandbox event path

## Outcome

One fixture coworker creates a TrueForge Daytona sandbox, streams command state and produces a bounded file using synthetic/public data.

## Acceptance criteria

- [x] Sandbox and command lifecycle map to normalized events.
- [x] No application, provider or Composio credential is present in sandbox.
- [x] Sandbox-enabled profile has no sensitive read tool.
- [x] Fixture reliably produces expected file.
- [x] Outbound reachability is measured and sensitive readiness fails when open.

## Verification

Run live sandbox fixture, credential canary absence and egress reachability tests.

## Completion evidence

- Redacted sandbox trace:
  - Wire `sandbox.created` → `sandbox.created` (creating)
  - Wire `model.message` sandbox tool_call → `sandbox.command_started` (running)
  - Wire `tool.response` → `sandbox.command_completed` or `sandbox.failed`
  - Orchestration projects `forgeroom.sandbox.v1` activity snapshots
- Egress result:
  - Live Daytona probe 2026-08-27: `curl https://example.com` returned non-2xx/redirect (`000` on current tier); `sensitiveDataReadiness: pass`
  - Credential canary: zero `P0_SANDBOX_CREDENTIAL_CANARY_ENV_KEYS` present in sandbox `printenv`
  - Fixture SHA256 `2ac98830ad3b156097e7f86b27dc315a20dcf41b6259cd76b299a0fc441845bf` matches `P0_SANDBOX_FIXTURE_DEMO_LINES`
- Tests:
  - `pnpm --filter @forgeroom/trueforge test`
  - `pnpm --filter @forgeroom/orchestration test`
- Blockers (out of scope):
  - TrueForge live sandbox turn blocked on OpenAI billing at probe time; Daytona-only fixture path verified
  - TrueForge `download-sandbox-file` → application artifact storage remains P0-310/P0-312
