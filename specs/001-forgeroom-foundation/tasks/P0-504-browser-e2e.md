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

Required provider env (never commit): `OPENAI_API_KEY`, `COMPOSIO_API_KEY`, `COMPOSIO_CONNECTED_ACCOUNT_ID`, `COMPOSIO_USER_ID`, `DAYTONA_API_KEY`, `TRUEFORGE_BASE_URL`, `FORGEROOM_E2E_GITHUB_OWNER`, `FORGEROOM_E2E_GITHUB_REPOSITORY`. The GitHub values are verified against the non-reversible hash of the approved synthetic target before reset or test mutation. Stack script: `apps/e2e/scripts/start-providers-stack.sh`.

Run three consecutive times after fixture reset to detect flakiness.

## Completion evidence

- Report/trace paths: `apps/e2e/playwright-report`, `apps/e2e/test-results` (gitignored)
- Three-run results (2026-08-29, `pnpm test:e2e`): 3/3 passed (~8s each, Chromium prototype smoke) on the final working tree.
- Slice 2 live-api (2026-08-29, isolated database, API `3100`, web `5273`): 2/2 applicable tests passed; the provider-only test remained explicitly skipped in API mode. Login occurs outside traced browser/request contexts, and the emitted compressed traces pass the credential/reasoning/raw-body scanner.
- Slice 3 (2026-08-29): serial 15-step providers narrative + `start-providers-stack.sh` + credential preflight; runtime provisioning reaches TrueForge with seeded Task/component/Composio grants. The latest live attempt is externally blocked because the configured OpenAI API key was invalidated (`token_invalidated`); no provider-backed pass is claimed.
- Runtime bridge focused verification (2026-08-29): orchestration 135/135; UI MCP 8/8; API session/runtime connector 11/11; demo fixtures 12/12; required-action/artifact API 6/6; PauseGroup DB 3/3; API and fixture typechecks passed.

## Work log

- 2026-08-29 — Slice 1: scaffold `@forgeroom/e2e` Playwright package, prototype smoke covering channel/GenUI/approval/Research coworker/tasks/choice/receipt/skill, trace redaction scan, CI `pnpm test:e2e`, fixture work-panel demo receipt entry. Live 15-step scenario gated behind `FORGEROOM_E2E_LIVE`.
- 2026-08-29 — Slice 2: live-api Playwright project (`FORGEROOM_E2E_LIVE=api`) boots migrate/seed/API/Vite via `apps/e2e/scripts/start-live-stack.sh`; demo-seed login/channel/coworkers/tasks smoke; complete-scenario soft-skips without providers; CI live-api job; channel workroom tolerates missing Composio; coworker detail strips `config` before strict profile parse. The final harness isolates API/web ports, database and provider environment, authenticates outside traced contexts and fails if emitted evidence contains even the disposable fixture credential.
- 2026-08-29 — Slice 3: one serial providers test (steps 1–15), `start-providers-stack.sh` (TrueForge health + full fixtures:reset + ARTIFACT_STORAGE_DIR), credential preflight (`PROVIDER_ENV_KEYS`), deny→retry→refresh→approve flow helpers, `pnpm test:e2e:providers`. Execution blocked without secrets in this environment.
- 2026-08-29 — Slice 4: strengthen the provider narrative with exact two-lane routing response checks; independent public fixture reads before/after denial and after approval; exact proposal, Task and controlled UI hash snapshots across refresh; and receipt lineage checks before/after immutable skill publication. Added a stable UIInstance identity attribute for replay assertions. Live execution remains blocked without provider secrets.
- 2026-08-29 — Slice 5: seeded the published controlled-component registry and Operator grants; compiled typed Composio and channel-scoped Task grants into immutable session revisions; registered and exact-allowlist-verified the hosted Composio MCP at API startup; exposed `records.task.upsert.v1` through the authenticated per-generation application MCP with authoritative run/message provenance; captured trusted required actions into durable PauseGroups; and published declared sandbox artifacts into canonical receipt lineage. The unchanged 15-step provider test now reaches the model provider and is blocked by provider account billing (`billing_not_active`).
- 2026-08-29 — Slice 6: adapted private MCP tool names and preload declarations to the provider contract, added an explicit Task create/update discriminator, derived a closed ChoiceForm interaction schema, dispatched committed component responses into the normal durable AG-UI ingestion path, made equivalent CoworkerDraft creation atomic/idempotent, and disabled trace DOM/network/source capture with a real-browser token regression. Unit, integration, security, lint and build gates pass; the live rerun now stops at the invalidated OpenAI credential before provider behavior can be proved.
