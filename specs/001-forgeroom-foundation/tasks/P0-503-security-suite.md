---
id: P0-503
title: Complete core security acceptance suite
status: done
owner: cursor-agent
started: 2026-08-29
depends_on: [P0-104, P0-109, P0-208, P0-213, P0-303, P0-306, P0-307, P0-308, P0-309, P0-311, P0-312, P0-313, P0-314, P0-318]
requirements: [AG-011, TR-003, SK-003, SK-004, SK-005, AGUI-008, GUI-004, GUI-005, AP-003, AP-005, AP-006, AP-007, AP-008, AU-001, AU-004]
specs: [../test-plan.md#security-acceptance-matrix, ../checklists/security.md]
adrs: [ADR-003, ADR-004, ADR-005, ADR-006, ADR-007]
touches: [security-tests]
---

# P0-503 — Complete security acceptance suite

## Outcome

Core SEC-001 through SEC-022 plus CoworkerDraft/Task/skill SEC-031 through SEC-033 pass here. Controlled AG-UI/GenUI SEC-023 through SEC-030 and SEC-034 through SEC-035 plus GUIT evidence belong to P0-506.

## Acceptance criteria

- [x] Auth, CSRF, isolation and capability tests pass.
- [x] Approval binding, replay, concurrency, denial and uncertain-resume tests pass.
- [x] Account, descriptor, session rotation and archive failure paths pass.
- [x] Prompt injection, Code Mode write approval and sandbox egress tests pass; unexpected native-child requests/events fail closed separately.
- [x] Coworker-builder injection cannot expand authority; Task tools enforce field/transition grants; saved skills cannot capture secrets or grant authority.
- [x] Native subagent, coordinator and open-generated UI inputs fail closed in the P0 feature profile.
- [x] Audit/fixture scans find no secret or reasoning field.
- [x] Core identity, capability, connector, approval, sandbox and audit security tests pass; the shared checklist links P0-506 for AG-UI/GenUI rows.
- [x] Independent reviewer signs the checklist.

## Verification

~~~bash
pnpm test:security
~~~

## Completion evidence

- Local report (2026-08-29): expanded `pnpm test:security` release runner under Node 24.19.0 — 82 files / 442 tests passed with zero skips across contracts, domain, DB, orchestration, adapters, API isolation/archive/audit paths, real Sharp image hardening, web trusted-host UI, controlled components and decompressed-trace redaction.
- Runner fails early below the repository's Node 22.12.0 engine floor and caps DB/API workers to avoid false timeout failures.
- Checklist reviewer: independent Codex boundary review and post-fix re-review on 2026-08-29; final focused verification passed 41/41 and accepted the P0-503/P0-506 independent-review criteria after six reported authorization/redaction/lifecycle defects were fixed with adversarial regressions.
- Code Mode note: P0 has no separate Code Mode dispatch type; the security proof covers the sandbox-enabled compiled MCP connector and fail-closed write-approval policy rather than claiming a distinct live dispatch surface.
- Open risks: live provider-backed acceptance belongs to P0-502/P0-504/P0-506 and remains blocked by provider billing; it is not represented by this core security-suite result.
