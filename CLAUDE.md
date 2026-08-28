# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ForgeRoom: a channel-first workspace where humans and persistent AI coworkers collaborate, use connected tools, render controlled generative UI, and pause for human approval before consequential actions. TypeScript, pnpm workspaces, Node 22.12+.

The repo is **spec-driven**. `specs/` is canonical and is the entry point for any non-trivial change — see "Spec workflow" below.

## Commands

```bash
pnpm install
pnpm lint         # eslint . && prettier --check .   (CI fails on unformatted files)
pnpm format       # prettier --write .
pnpm typecheck    # tsc --noEmit in every package
pnpm test         # vitest run in every package
pnpm build        # esbuild bundles for api/worker, vite for web, tsc --noEmit for packages
```

CI (`.github/workflows/ci.yml`) runs exactly these four, in that order, with a Postgres 16 service.

Per-package / single test:

```bash
pnpm --filter @forgeroom/api test
pnpm --filter @forgeroom/orchestration exec vitest run src/pause-resume.test.ts
pnpm --filter @forgeroom/db exec vitest run -t "preserves FIFO"
```

Database:

```bash
docker compose -f infra/compose.yaml up -d
pnpm --filter @forgeroom/db migrate        # forward, idempotent
pnpm --filter @forgeroom/db migrate:down   # local/test only
pnpm fixtures:seed / pnpm fixtures:reset   # demo fixtures via @forgeroom/test-fixtures
```

Running the app (copy `.env.example` → `.env` first):

```bash
pnpm dev                                          # API on 0.0.0.0:$PORT (default 3000), embeds the worker
pnpm dev:web                                      # Vite on 5173, proxies /api and /health to 127.0.0.1:3000
pnpm dev:web:prototype                            # frontend-only fixture mode, never contacts the API
FORGEROOM_EMBED_WORKER=false pnpm dev             # then `pnpm dev:worker` as a separate process
```

`/health` works without TrueForge, Composio, or model credentials.

### Test types

`*.integration.test.ts` files hit real PostgreSQL. `packages/db/src/test-harness.ts` resolves a database from `DATABASE_URL`, then a local socket, then `docker compose up -d postgres`; each test gets a fresh temp database via `withMigratedDatabase`. Plain `*.test.ts` files are pure unit tests with no external dependency.

## Architecture

### Workspace layout

- `apps/api` — Hono HTTP API. One directory per bounded surface (`auth`, `workspace`, `approvals`, `connections`, `artifacts`, `components`, `ui-instances`, `ag-ui`, `mcp`, `tasks`). Each has `service.ts` (logic) + `routes.ts` (HTTP). `server.ts` wires services by dependency injection so tests can pass fakes; `index.ts` (`startApiProcess`) owns real env/DB/TrueForge construction and optionally embeds the worker.
- `apps/worker` — queue consumer. `parseWorkerCommand` validates against `internalWorkerCommandSchema`, then dispatches to `@forgeroom/db` + `@forgeroom/orchestration`.
- `apps/web` — React 19 + Vite + TanStack Router/Query + Tailwind 4.
- `packages/contracts` — Zod schemas shared by server and browser. The single source of truth for wire shapes, event kinds, run states, and the internal worker command set.
- `packages/domain` — pure state machines and policy (`transitions.ts` holds `RUN_STEP_TRANSITIONS`, `TASK_TRANSITIONS`, etc.). No I/O.
- `packages/db` — SQL migrations (canonical schema), Drizzle table mirrors, and one module per persistence concern. Migrations are hand-written SQL, **not** `drizzle-kit push`.
- `packages/orchestration` — the runtime core: turn queue, session provisioning/rotation, event normalization, pause/resume, capability intersection, component tool bridge. Deep imports are explicit subpath exports in `package.json`.
- `packages/integrations/{trueforge,ag-ui,composio,artifacts,ui-components-mcp}` — provider adapters.
- `packages/ui/components` — the controlled component registry shared with the web app.

Adding a subpath to `orchestration`/`domain`/`db` requires adding it to that package's `exports` map.

### Runtime model

The **application database is authoritative** for channel state; TrueForge is authoritative only for its own sessions, turns, and sandboxes.

Message path: authenticated command → persist Message + Run + RunSteps → append channel event → enqueue per channel-coworker session → short-lease claim by worker → create TrueForge turn → normalize streamed events → append channel events.

Pause path: `turn.done` with required actions closes the AgentTurn but keeps the RunStep **nonterminal** → one PauseGroup + RequiredActions → decisions collected → CAS `collecting → resuming` → one PauseResume intent → one response-only turn.

Key state machines live in `packages/contracts/src/runs.ts`: `runLifecycle`, `runStepState`, `agentTurnState`. A Run spans RunSteps (one per assigned coworker); a RunStep spans one or more AgentTurns. Legal transitions are enforced in `@forgeroom/domain`.

Frontend consumes **AG-UI** (`@ag-ui/*` pinned at 0.0.57) — never a second raw TrueForge browser stream. Raw provider payloads, model reasoning, credentials, and arbitrary tool bodies must not reach persistence or the UI; normalize into typed domain events first.

### Invariants that tests actively enforce

`packages/contracts/src/boundary.ts` (`PACKAGE_BOUNDARY`) and `unsupported.ts` (`P0_UNSUPPORTED_CAPABILITIES`) declare what the 0.1 release deliberately does **not** support: open generated UI, `iframe_v1`, native subagents, coordinator synthesis, CopilotKit gateway, `request_agent_turn`. Unknown/ineligible capabilities must fail closed, not degrade. `packages/db/src/p0-exclusions.test.ts` greps migration SQL for forbidden columns, so schema work that reintroduces those surfaces fails CI.

Other rules that code review and tests assume:

- One TrueForge session per channel + persistent coworker; rotation swaps generations atomically and never migrates a response-only resume.
- Composio exposes only literal, pinned direct tools with a pinned connected account. New tools need a grant, a new session revision, and a reviewed policy adapter for writes.
- Component names, client-supplied schemas, generated props, and frontend tool advertisements are **untrusted**. Re-check publication, version, and grants at call time; keep render/data/action authority separate.
- Never render model HTML in the host DOM, and never move canonical approval controls into generated UI.
- Approval, grant, account-pinning, session-rotation, and sandbox-egress controls may not be weakened to make a demo pass.

### Secrets and fixtures

`.env` and `provider-fixtures/**/secrets/`, `*.secret.json` are gitignored. `provider-fixtures/` holds redacted descriptors and verified-probe records; commit only redacted account suffixes and hashes. Never put credentials, raw OAuth headers, or model reasoning into source, logs, fixtures, task evidence, or screenshots.

Local machine state lives in `.data/` (artifacts when `ARTIFACT_STORAGE_DIR` points there) and the Docker volume `forgeroom_pg` — both regeneratable.

## Spec workflow (`specs/`)

Before implementing: read `specs/README.md`, `specs/AGENT_WORKFLOW.md`, the task file under `specs/00*/tasks/`, and every spec/ADR it links. `002-forgeroom-platform/` owns durable product behavior; `001-forgeroom-foundation/` owns the 0.1 slice. When two canonical files conflict, stop and raise a spec change (`specs/templates/SPEC_CHANGE_TEMPLATE.md`) — do not pick the easier reading in code.

- Task states: `blocked` → `ready` → `in_progress` → `in_review` → `done`. One owner per `in_progress` task; a checkbox is checked only at `done`.
- IDs: requirements `CH-003`/`RUN-005`/`KN-005`…, decisions `ADR-001`, tasks `P0-*` (0.1) / `P1-*` / `P2-*` / `P3-*`. Every PR names at least one task ID.
- Finishing a task means updating the task file's work log/evidence **and** the release `STATUS.md` and `tasks.md`. Follow-up work becomes a new task, not a prose note.
- Do not infer a missing provider slug, schema, account ID, security behavior, or TrueForge event shape — treat it as a blocker.
- Add tests with the implementation, not afterward.

## Conventions

- ESM everywhere (`"type": "module"`), strict TS with `noUncheckedIndexedAccess`, `noUnusedLocals/Parameters`, and `verbatimModuleSyntax` — use `import type` for type-only imports.
- Prettier `printWidth: 100`. `specs/` is excluded from both eslint and prettier.
- Cross-package dependencies use `workspace:*`; shared versions come from the `catalog:` in `pnpm-workspace.yaml`.
- Services take their collaborators as optional constructor options and degrade to `undefined` when a dependency (e.g. `sql`) is absent — preserve that shape so tests can construct partial apps.

## Merge policy

Merge PRs into `main` with a **merge commit** (`gh pr merge --merge`). Do not squash or rebase unless explicitly asked. Preserve branch history so task work and review fixes stay inspectable.

`AGENTS.md` additionally describes the Qodo review toolbox conventions used in this repo (pre-PR local review, structured PR findings, Review Standards).
