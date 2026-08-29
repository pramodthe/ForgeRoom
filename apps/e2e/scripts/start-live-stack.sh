#!/usr/bin/env bash
# Boot API + Vite (live mode) for FORGEROOM_E2E_LIVE=api.
# Expects DATABASE_URL + OWNER_PASSWORD in the environment (or repo .env).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

# Preserve explicit one-shot/CI controls while allowing `.env` to fill other
# local values. In particular, never redirect an isolated E2E run to the
# developer database after the caller supplied DATABASE_URL.
CONTROL_ENV_NAMES=(
  DATABASE_URL
  PORT
  FORGEROOM_E2E_BASE_URL
  FORGEROOM_E2E_WEB_PORT
  FORGEROOM_E2E_OWNER_PASSWORD
)
EXPLICIT_CONTROL_ENV_NAMES=()
EXPLICIT_CONTROL_ENV_VALUES=()
for name in "${CONTROL_ENV_NAMES[@]}"; do
  if [[ -n "${!name:-}" ]]; then
    EXPLICIT_CONTROL_ENV_NAMES+=("$name")
    EXPLICIT_CONTROL_ENV_VALUES+=("${!name}")
  fi
done

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

for index in "${!EXPLICIT_CONTROL_ENV_NAMES[@]}"; do
  export "${EXPLICIT_CONTROL_ENV_NAMES[$index]}=${EXPLICIT_CONTROL_ENV_VALUES[$index]}"
done

# This stack intentionally proves the credential-free application/API slice.
# Provider-backed execution is isolated in start-providers-stack.sh; inherited
# developer credentials must not turn this smoke test into a live provider run.
unset OPENAI_API_KEY
unset COMPOSIO_API_KEY
unset COMPOSIO_CONNECTED_ACCOUNT_ID
unset COMPOSIO_USER_ID
unset DAYTONA_API_KEY
unset TRUEFORGE_BASE_URL

# Force loopback origin so the isolated E2E Vite port matches API Origin/CSRF checks.
export HOST="127.0.0.1"
export PORT="${PORT:-3000}"
WEB_PORT="${FORGEROOM_E2E_WEB_PORT:-5173}"
export APP_ORIGIN="${FORGEROOM_E2E_BASE_URL:-http://127.0.0.1:${WEB_PORT}}"
export VITE_API_PROXY_TARGET="http://127.0.0.1:${PORT}"
export FORGEROOM_EMBED_WORKER="${FORGEROOM_EMBED_WORKER:-true}"
export FORGEROOM_E2E_OWNER_PASSWORD="${FORGEROOM_E2E_OWNER_PASSWORD:-correct-horse-battery}"
export OWNER_PASSWORD="$FORGEROOM_E2E_OWNER_PASSWORD"
export OWNER_EMAIL="${OWNER_EMAIL:-owner@example.test}"
export DATABASE_URL="${DATABASE_URL:-postgres://forgeroom:forgeroom@127.0.0.1:5432/forgeroom}"

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

exec pnpm --filter @forgeroom/web exec vite --host 127.0.0.1 --port "$WEB_PORT" --strictPort
