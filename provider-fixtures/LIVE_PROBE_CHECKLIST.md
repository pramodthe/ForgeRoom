# P0-000 live probe checklist (human)

Do not commit secret values. Attach only redacted evidence to the task file.

## Required environment variables

| Variable                                                  | Purpose                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------ |
| `COMPOSIO_API_KEY`                                        | Hosted MCP / toolkit and account probes                                  |
| `COMPOSIO_CONNECTED_ACCOUNT_ID`                           | Exact pinned connected account (also record redacted suffix in fixtures) |
| `TRUEFORGE_BASE_URL`                                      | Local/open-source harness base URL (default `http://127.0.0.1:8790`)     |
| `OPENAI_API_KEY`                                          | P0 local model provider for TrueForge coworker presets (OD-005)          |
| `DAYTONA_API_KEY`                                         | Sandbox file produce + download                                          |
| `ARTIFACT_STORAGE_DIR` or demo object-storage credentials | Durable artifact retain/download                                         |
| `DATABASE_URL`                                            | Fixture reset safety checks (P0-105)                                     |

### TrueForge auth note (important)

TrueForge is open source. **Local standalone mode does not use `TRUEFORGE_API_KEY`** — there is no built-in API-key scheme; the harness stamps a local admin identity for anyone who can reach localhost. Leave `TRUEFORGE_API_KEY` empty for local probes.

What you need instead:

1. A running harness: `npx @truefoundry/trueforge@latest` (UI/API on port **8790** by default).
2. An **OpenAI** key configured as the model provider (`OPENAI_API_KEY`, also paste into TrueForge **Settings → Models → OpenAI**).

`MODEL_PROVIDER_API_KEY` is kept only as a compatibility alias for older notes — prefer `OPENAI_API_KEY`.

Optional when probing optional CopilotKit later (P0-210 only): none required for P0-000; keep gateway disabled.

## Probe steps (2026-08-26 run on `codex/p0-000-live-probes`)

- [x] List Composio toolkits/accounts; choose ≤2 apps; pin account; record redacted suffix (`nizY`, github ACTIVE).
- [x] Export read / deterministic-write / reconciliation-read direct-tool descriptors; check in hashes under `composio/descriptors/manifest.json`.
- [x] Run synthetic write then reconciliation read on fixture data; confirm expected state (label `forgeroom-p0-probe` on `pramodthe/Hi-Tuto#10`).
- [x] Provider fixture reset twice — label removal idempotent (2nd remove returns expected provider error; label absent after both).
- [x] Seed Operator coworker with a reliable model preset; record preset id — **`openai/gpt-5-4-mini`** via local TrueForge agent `forgeroom-operator` (smoke turn `done`, output `p0-openai-ok`).
- [x] Resolve Research draft prompt to exact permission preview/denials (no writes) — model preset **`openai/gpt-5-4-mini`**; grants `GITHUB_GET_AN_ISSUE` only; deny write/destructive/new-account/native-subagents (exactDiff in fixture; UI binding still P0-213).
- [x] Produce one Daytona sample file; download via Daytona SDK — TrueForge→artifact-storage retain path still pending (harness+model now ready).
- [x] Local `ARTIFACT_STORAGE_DIR` adapter retain (separate probe; bytes differ from Daytona SDK download hash).
- [x] Confirm local deployment topology preflight (DB, auth env, Composio, Daytona, storage, TrueForge, OpenAI) — **pass** 2026-08-26.
- [ ] Record verified run-limit watchdog behavior or adjust candidates with evidence — **blocked: TrueForge hard enforcement (P0-204)**.
- [x] Confirm local Postgres schema for demo fixture reset — **verified 2026-08-26**: migrations up to date; `workspaces` table present.

## Explicit non-goals for the human probe

- Do not enable native subagents, coordinator synthesis, component catalogue UI, or `iframe_v1`.
- Do not enable `/api/copilotkit` during P0-000; that remains P0-210.
- Do not paste API keys, full account IDs, OAuth headers, or raw tool bodies into git.
