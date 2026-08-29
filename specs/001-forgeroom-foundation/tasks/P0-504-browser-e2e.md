---
id: P0-504
title: Implement complete browser end-to-end scenario
status: in_progress
owner: cursor-agent
started: 2026-08-29
depends_on: [P0-109, P0-213, P0-305, P0-309, P0-312, P0-313, P0-318, P0-407, P0-408, P0-410]
requirements: [CH-005, OR-001, AG-010, TR-001, SK-001, AGUI-003, GUI-001, GUI-011, AP-008, SB-001]
specs: [../test-plan.md#browser-end-to-end-scenario, ../demo.md#demo-narrative]
adrs: [ADR-001, ADR-003, ADR-004, ADR-005, ADR-006, ADR-007]
touches: [e2e-tests, apps/e2e, apps/web]
---

# P0-504 — Implement complete browser end-to-end scenario

## Outcome

One reliable Playwright test proves conversational coworker creation, two-coworker work, a Task, controlled GenUI, sandbox artifact, approval, refresh, receipt and Save-as-skill.

## Acceptance criteria

- [ ] Executes every numbered scenario in `test-plan.md`. *(slice 1–2: prototype + live-api; slice 3: serial 15-step under `FORGEROOM_E2E_LIVE=providers` — blocked here on provider secrets)*
- [ ] Denial verifies unchanged provider state before revised request. *(fixture deny; live deny→retry wired in slice 3, needs credentials to prove provider unchanged)*
- [ ] Refresh restores exact pending proposal. *(slice 3 wired; needs credentials)*
- [ ] A controlled chart/table and bounded interaction render inline and survive refresh with identical revisions/hashes. *(slice 1 fixture; live in slice 3)*
- [ ] Creating the second coworker shows an exact permission preview and one confirmed provisioning result. *(slice 1 fixture; live Research path in slice 3)*
- [ ] A canonical Task survives refresh and an authorized transition; a completed Run publishes and attaches one reviewed private skill. *(slice 1 fixture; live in slice 3)*
- [x] Native subagent, coordinator, component-catalogue and generated-frame surfaces are absent.
- [ ] Approval reaches expected deterministic state under read reconciliation. *(slice 3 wired; needs credentials)*
- [x] Uses accessible locators and event waits, not fixed sleeps.
- [x] Captures trace/screenshots without credentials, personal data, raw provider bodies or model reasoning; compressed trace scan proves redaction.

## Verification

~~~bash
pnpm test:e2e
FORGEROOM_E2E_LIVE=api pnpm test:e2e
# Full provider narrative (local/secrets + TrueForge):
pnpm test:e2e:providers
# or: FORGEROOM_E2E_LIVE=1 pnpm test:e2e
~~~

Required provider env (never commit): `OPENAI_API_KEY`, `COMPOSIO_API_KEY`, `COMPOSIO_CONNECTED_ACCOUNT_ID`, `COMPOSIO_USER_ID`, `DAYTONA_API_KEY`, `TRUEFORGE_BASE_URL`. Stack script: `apps/e2e/scripts/start-providers-stack.sh`.

Run three consecutive times after fixture reset to detect flakiness.

## Completion evidence

- Report/trace paths: `apps/e2e/playwright-report`, `apps/e2e/test-results` (gitignored)
- Three-run results (2026-08-29, `CI=1 pnpm test:e2e`): 3/3 passed (~8s each, chromium prototype smoke)
- Slice 2 live-api (2026-08-29, `CI=1 FORGEROOM_E2E_LIVE=api pnpm test:e2e`): live-api smoke + scenario structure passed; provider steps skipped without credentials
- Slice 3 (2026-08-29): serial 15-step providers narrative + `start-providers-stack.sh` + credential preflight; **live run blocked** — provider secrets not present in agent environment

## Work log

- 2026-08-29 — Slice 1: scaffold `@forgeroom/e2e` Playwright package, prototype smoke covering channel/GenUI/approval/Research coworker/tasks/choice/receipt/skill, trace redaction scan, CI `pnpm test:e2e`, fixture work-panel demo receipt entry. Live 15-step scenario gated behind `FORGEROOM_E2E_LIVE`.
- 2026-08-29 — Slice 2: live-api Playwright project (`FORGEROOM_E2E_LIVE=api`) boots migrate/seed/API/Vite via `apps/e2e/scripts/start-live-stack.sh`; demo-seed login/channel/coworkers/tasks smoke; complete-scenario soft-skips without providers; CI live-api job; channel workroom tolerates missing Composio; coworker detail strips `config` before strict profile parse; trace scan scrub of fixture password + ignores model_provider openai.
- 2026-08-29 — Slice 3: one serial providers test (steps 1–15), `start-providers-stack.sh` (TrueForge health + full fixtures:reset + ARTIFACT_STORAGE_DIR), credential preflight (`PROVIDER_ENV_KEYS`), deny→retry→refresh→approve flow helpers, `pnpm test:e2e:providers`. Execution blocked without secrets in this environment.
