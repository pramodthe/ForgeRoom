# P0-000 live probe checklist (human)

Do not commit secret values. Attach only redacted evidence to the task file.

## Required environment variables

| Variable                                                  | Purpose                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------ |
| `COMPOSIO_API_KEY`                                        | Hosted MCP / toolkit and account probes                                  |
| `COMPOSIO_CONNECTED_ACCOUNT_ID`                           | Exact pinned connected account (also record redacted suffix in fixtures) |
| `TRUEFORGE_BASE_URL`                                      | Harness base URL                                                         |
| `TRUEFORGE_API_KEY`                                       | Session/AgentSpec/Daytona probes                                         |
| `MODEL_PROVIDER_API_KEY`                                  | Model through TrueForge for coworker preset reliability                  |
| `DAYTONA_API_KEY`                                         | Sandbox file produce + download                                          |
| `ARTIFACT_STORAGE_DIR` or demo object-storage credentials | Durable artifact retain/download                                         |
| `DATABASE_URL`                                            | Fixture reset safety checks (P0-105)                                     |

Optional when probing optional CopilotKit later (P0-210 only): none required for P0-000; keep gateway disabled.

## Probe steps (2026-08-26 run on `codex/p0-000-live-probes`)

- [x] List Composio toolkits/accounts; choose ≤2 apps; pin account; record redacted suffix (`nizY`, github ACTIVE).
- [x] Export read / deterministic-write / reconciliation-read direct-tool descriptors; check in hashes under `composio/descriptors/manifest.json`.
- [x] Run synthetic write then reconciliation read on fixture data; confirm expected state (label `forgeroom-p0-probe` on `pramodthe/Hi-Tuto#10`).
- [x] Provider fixture reset twice — label removal idempotent (2nd remove returns expected provider error; label absent after both).
- [ ] Seed Operator coworker with a reliable model preset; record preset id — **blocked: `TRUEFORGE_API_KEY`, `MODEL_PROVIDER_API_KEY` missing**.
- [ ] Resolve Research draft prompt to exact permission preview/denials (no writes) — **blocked: TrueForge harness + model preset**.
- [x] Produce one Daytona sample file; download via Daytona SDK — **TrueForge→artifact-storage retain path blocked on `TRUEFORGE_API_KEY`**.
- [x] Local `ARTIFACT_STORAGE_DIR` adapter retain (separate probe; bytes differ from Daytona SDK download hash).
- [x] Confirm local deployment topology preflight (DB, auth env, Composio, Daytona, storage) — partial; TrueForge/model keys missing.
- [ ] Record verified run-limit watchdog behavior or adjust candidates with evidence — **blocked: TrueForge hard enforcement (P0-204)**.

## Explicit non-goals for the human probe

- Do not enable native subagents, coordinator synthesis, component catalogue UI, or `iframe_v1`.
- Do not enable `/api/copilotkit` during P0-000; that remains P0-210.
- Do not paste API keys, full account IDs, OAuth headers, or raw tool bodies into git.
