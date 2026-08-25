---
id: P0-101
title: Scaffold monorepo and CI
status: done
owner: cursor-agent
started: 2026-08-25
depends_on: []
requirements: [OSS-001]
specs: [../plan.md#reference-stack, ../../002-forgeroom-platform/open-source.md]
adrs: []
touches: [apps, packages, infra, package.json, pnpm-workspace.yaml]
---

# P0-101 — Scaffold monorepo and CI

## Outcome

A clean clone installs, checks, tests and builds the separable web, API, worker and shared packages.

## Acceptance criteria

- [x] Repository layout matches `plan.md` or an accepted ADR.
- [x] Shared packages include explicit AG-UI and controlled-component boundaries without loading the P1 generated-UI runtime or selecting unverified package versions ahead of P0-210.
- [x] API and worker modules are separable even if one demo process starts both.
- [x] Format, lint, typecheck, unit-test and production-build scripts exist.
- [x] CI runs the same frozen-lockfile commands.
- [x] Environment example lists names only and no secret is committed.

## Verification

~~~bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
~~~

## Completion evidence

- Files changed: pnpm workspace (`package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`), `apps/{web,api,worker}`, `packages/{contracts,domain,db,orchestration,test-fixtures,integrations/*,ui/components}`, `infra/compose.yaml`, `.github/workflows/ci.yml`, `.env.example`, ESLint/Prettier/TypeScript config, README local-dev docs.
- CI run: [PR #1 run 32908263615](https://github.com/pramodthe/ForgeRoom/actions/runs/32908263615) passed the frozen-lockfile lint/typecheck/test/build workflow in 43 seconds.
- Commands/results:
  - `node --version` — `v22.12.0`, the documented and CI minimum
  - `pnpm install --frozen-lockfile` — lockfile up to date
  - `pnpm lint` — pass (eslint + prettier --check)
  - `pnpm typecheck` — pass (13 workspace packages)
  - `pnpm test` — pass (19 tests)
  - `pnpm build` — pass (API/worker esbuild + Vite production build)
  - `GET http://127.0.0.1:3000/health` — `{"ok":true,"service":"forgeroom-api"}` without provider credentials
  - Browser `http://127.0.0.1:5173/` — title/h1 ForgeRoom, HostButton focused on click, no generated-UI iframe

## Work log

- 2026-08-25 — Claimed by cursor-agent.
  - Outcome: clean clone installs, lints, typechecks, tests and builds separable web, API, worker and shared packages.
  - Expected changes: `apps/`, `packages/`, `infra/compose.yaml`, root `package.json`, `pnpm-workspace.yaml`, CI, `.env.example`, README local-dev docs.
  - Requirements: OSS-001 (local clone builds/tests/starts without private ForgeRoom credentials).
  - Non-goals: domain schemas (P0-102), migrations (P0-103), auth (P0-104), pinning `@ag-ui/*` or CopilotKit (P0-210), TrueForge/Composio/Daytona SDKs, product UI shell (P0-401), Playwright E2E (P0-504).
  - Verification: `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
- 2026-08-25 — Implementation complete; moved to in_review. Baseline recovery commit remains `3976ccb`.
- 2026-08-25 — Review remediation completed: formatting fixed, the Node/Vite minimum aligned at 22.12.0, and canonical specifications included in the public repository. The full local CI command chain and API health probe passed on Node 22.12.0; hosted CI remained pending until PR #1.
- 2026-08-25 — Independent review accepted after a clean-clone verification, specification-graph validation, secret scan, and green GitHub Actions run; moved to `done`.

## Handoff

- Outcome: pnpm TypeScript monorepo installs, checks, tests, builds, and serves `/health` plus a placeholder web shell without provider secrets.
- Open risks: Playwright is deferred to P0-504.
- Follow-up tasks: P0-102 after this task is `done`; P0-000 remains independently ready.
