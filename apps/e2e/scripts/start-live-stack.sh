#!/usr/bin/env bash
# Boot API + Vite (live mode) for FORGEROOM_E2E_LIVE=api.
# Expects DATABASE_URL + OWNER_PASSWORD in the environment (or repo .env).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

# Force loopback origin so Vite (127.0.0.1:5173) matches API Origin/CSRF checks.
export HOST="127.0.0.1"
export PORT="${PORT:-3000}"
export APP_ORIGIN="http://127.0.0.1:5173"
export FORGEROOM_EMBED_WORKER="${FORGEROOM_EMBED_WORKER:-true}"
export OWNER_PASSWORD="${OWNER_PASSWORD:-correct-horse-battery}"
export OWNER_EMAIL="${OWNER_EMAIL:-owner@example.test}"
export DATABASE_URL="${DATABASE_URL:-postgres://forgeroom:forgeroom@127.0.0.1:5432/forgeroom}"
export FORGEROOM_E2E_OWNER_PASSWORD="${FORGEROOM_E2E_OWNER_PASSWORD:-$OWNER_PASSWORD}"

pnpm --filter @forgeroom/db migrate
pnpm fixtures:reset -- --no-provider

pnpm --filter @forgeroom/api exec tsx src/main.ts &
API_PID=$!
cleanup() {
  kill "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT

for _ in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null; then
    break
  fi
  sleep 1
done
curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null

exec pnpm --filter @forgeroom/web exec vite --host 127.0.0.1 --port 5173
