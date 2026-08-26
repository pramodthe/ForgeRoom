# ForgeRoom P0 database migrations

SQL files in `migrations/` are the canonical schema. Drizzle table definitions in `src/schema.ts` mirror those columns for typed application access; they are not applied with `drizzle-kit push`.

## Forward

From an empty PostgreSQL database:

```bash
export DATABASE_URL=postgres://forgeroom:forgeroom@127.0.0.1:5432/forgeroom
pnpm --filter @forgeroom/db migrate
```

`0001_p0_foundation.sql` creates the complete P0 physical schema: identity, coworkers/drafts, skills, channels/events, Tasks, stable ChannelAgentSession + immutable generation history, Runs/RunSteps/queue/turns, canonical TrueForge and AG-UI event records, connectors/grants, controlled-registry UI, PauseGroups, artifacts, and append-only audit events.

Re-running `migrate` is idempotent through `forgeroom_schema_migrations`.

## Rollback

```bash
pnpm --filter @forgeroom/db migrate:down
```

`0001_p0_foundation.down.sql` drops every P0 table and trigger function. It is intended for local/test databases. Do not run it against a workspace with retained channel or audit history.

To recreate a clean local instance instead:

```bash
docker compose -f infra/compose.yaml down -v
docker compose -f infra/compose.yaml up -d
pnpm --filter @forgeroom/db migrate
```

## P0 exclusions

This migration does not add generated-document/open-UI columns or tables (classification high-water marks, source/body blobs, bootstrap, CSP, verifier, delivery capabilities, trusted-confirmation interaction states, native-subagent session columns, or coordinator/parent RunStep columns). Those remain a separately gated later migration.
