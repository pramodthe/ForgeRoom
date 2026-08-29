---
id: P0-505
title: Complete preflight, documentation and demo rehearsal
status: blocked
owner: unassigned
depends_on: [P0-313, P0-501, P0-502, P0-503, P0-504, P0-506]
requirements: [AU-003, OSS-001]
specs: [../demo.md, ../checklists/requirements.md, ../checklists/security.md, ../checklists/demo.md, ../../002-forgeroom-platform/open-source.md, ../../002-forgeroom-platform/decisions/OPEN.md]
adrs: []
touches: [README.md, preflight, demo-assets]
---

# P0-505 — Complete preflight, documentation and demo rehearsal

## Outcome

A clean clone can run the product, preflight all dependencies, pass release gates and deliver the three-minute demo repeatedly.

## Acceptance criteria

- [x] Preflight reports database, auth, TrueForge, model, Daytona, Composio account/tools, AgentSpec approvals, storage, worker, AG-UI package graph, fixed component registry, CoworkerDraft/Task/skill readiness and confirms disabled P1 capabilities without secrets.
- [x] Clean-clone README setup succeeds.
- [ ] Before any public repository/release artifact, PD-002 is closed and the approved `LICENSE`, `NOTICE`, dependency-license review and hosted/commercial boundary are committed/documented.
- [ ] All P0 tasks and checklists are done.
- [ ] Fixture reset and three consecutive E2E runs pass.
- [ ] Three-minute script is rehearsed three times within time.
- [ ] Rehearsal visibly proves conversational coworker creation, one Task, a controlled chart/table, one bounded interaction, trusted approval and Save-as-skill.
- [ ] Required review evidence is linked.
- [ ] STATUS shows no P0 blocker.

## Verification

Run the full release command set from `test-plan.md`, then complete and independently review every checklist.

## Completion evidence

- Clean-clone commands/results: verified from a fresh `/tmp` clone on Node 24.19.0 with `pnpm install --frozen-lockfile`, `.env.example` copied to `.env`, a disposable local owner password supplied as README requires, database migration, `pnpm dev`, and `GET /health` returning `{"ok":true,"service":"forgeroom-api"}`.
- Preflight command/results: `pnpm preflight` reports all 13 required surfaces with redacted `verified`/`reachable`/`configured`/`blocked` states; `node --test scripts/preflight.test.mjs` passes 6/6, including malformed production-password hashes, absent-provider, configured-provider and secret-redaction coverage, and the root `pnpm test` command passes. The current local invocation correctly remains blocked while TrueForge is unreachable and Composio configuration is incomplete.
- License/dependency boundary: official Apache-2.0 text is committed as `LICENSE`; `NOTICE`, `DEPENDENCY_LICENSES.md`, the SPDX package field and the self-hosted/optional-managed-service README boundary are present. `pnpm licenses list --prod --long` reports only MIT, Apache-2.0, BSD-3-Clause, ISC, 0BSD, Unlicense and the documented Sharp/libvips LGPL runtime family. PD-002 founder/legal approval remains open.
- Browser stability: final-tree prototype smoke passed 3/3 consecutively; isolated credential-free live API passed 2/2 applicable tests with clean compressed-trace scanning. The provider-only narrative remains unproved because the configured OpenAI API key is invalidated; the release preflight is otherwise ready when supplied the approved non-secret GitHub fixture target.
- Preflight screenshot:
- Demo timing:
- Review links:
