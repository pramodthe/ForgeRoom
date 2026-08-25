# ForgeRoom

ForgeRoom is an open-source workspace where humans and persistent AI coworkers collaborate in channels, use connected tools, create interactive UI and artifacts, and pause for human approval before consequential actions.

> Status: 0.1 monorepo scaffold is in review. Product behavior is specified; most runtime features are not implemented yet.

## Requirements

- Node.js 22.12+
- [pnpm](https://pnpm.io/) 10.34.5 (`packageManager` in `package.json`)

## Local development

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Optional local PostgreSQL:

```bash
docker compose -f infra/compose.yaml up -d
```

PostgreSQL data lives in the Docker named volume `forgeroom_pg`, not under `.data/`. To wipe the database and recreate an empty instance:

```bash
docker compose -f infra/compose.yaml down -v
docker compose -f infra/compose.yaml up -d
```

### Local machine state (`.data/`)

The repo root `.data/` directory holds **machine-local runtime files** that must not be committed (see `.gitignore`). Nothing in the scaffold creates it until you configure a path that points there.

| Contents                                 | Created by                                                             | Safe to delete?                                                                         |
| ---------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Artifact files (e.g. `.data/artifacts/`) | API/worker when `ARTIFACT_STORAGE_DIR` is set to a path under `.data/` | Yes — you lose local artifact blobs; they are recreated when those features write again |
| Other local caches                       | Dev tooling as runtime features land                                   | Usually yes — treat as regeneratable unless you rely on them for debugging              |

**Not stored in `.data/`:** optional PostgreSQL from `infra/compose.yaml` (Docker volume `forgeroom_pg`; reset with the commands above).

To reset local artifact storage:

```bash
rm -rf .data/
mkdir -p .data/artifacts
# In .env: ARTIFACT_STORAGE_DIR=.data/artifacts
pnpm --filter @forgeroom/api dev
```

Copy `.env.example` to `.env` and fill values locally. The file lists names only; never commit secrets. The API `/health` endpoint starts without TrueForge, Composio, or model credentials.

```bash
pnpm --filter @forgeroom/api dev
pnpm --filter @forgeroom/web dev
```

By default the API also starts the worker runtime (`FORGEROOM_EMBED_WORKER=true`). To run them as separate processes:

```bash
FORGEROOM_EMBED_WORKER=false pnpm --filter @forgeroom/api dev
pnpm --filter @forgeroom/worker dev
```

The API binds to `0.0.0.0:$PORT` (`PORT` defaults to 3000).

## Repository layout

```text
apps/web            React + Vite workroom
apps/api            Hono HTTP API
apps/worker         Standalone worker process
packages/           Shared contracts, domain, db, orchestration, integrations, UI
infra/compose.yaml  Local PostgreSQL
```

Exact `@ag-ui/*` package versions are not selected in this scaffold. That freeze is owned by P0-210.

## Specs

The canonical product contracts and implementation tasks are published under `specs/`.

- [Specification workspace](./specs/README.md)
- [0.1 foundation specification](./specs/001-forgeroom-foundation/spec.md)
- [Startup platform specification](./specs/002-forgeroom-platform/spec.md)
- [Roadmap](./specs/002-forgeroom-platform/roadmap.md)
- [Implementation tasks](./specs/001-forgeroom-foundation/tasks.md)

The canonical public repository is [pramodthe/ForgeRoom](https://github.com/pramodthe/ForgeRoom).
