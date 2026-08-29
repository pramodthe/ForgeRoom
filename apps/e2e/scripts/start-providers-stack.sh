#!/usr/bin/env bash
# Boot TrueForge-backed API + Vite for FORGEROOM_E2E_LIVE=1|providers.
# Requires provider secrets in the environment (or repo .env). Never prints secret values.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "missing required env: $name" >&2
    exit 1
  fi
}

require_env OPENAI_API_KEY
require_env COMPOSIO_API_KEY
require_env COMPOSIO_CONNECTED_ACCOUNT_ID
require_env COMPOSIO_USER_ID
require_env DAYTONA_API_KEY
require_env TRUEFORGE_BASE_URL
require_env FORGEROOM_E2E_GITHUB_OWNER
require_env FORGEROOM_E2E_GITHUB_REPOSITORY

# Force loopback origin so Vite (127.0.0.1:5173) matches API Origin/CSRF checks.
export HOST="127.0.0.1"
export PORT="${PORT:-3000}"
export APP_ORIGIN="http://127.0.0.1:5173"
export FORGEROOM_EMBED_WORKER="${FORGEROOM_EMBED_WORKER:-true}"
export OWNER_PASSWORD="${OWNER_PASSWORD:-correct-horse-battery}"
export OWNER_EMAIL="${OWNER_EMAIL:-owner@example.test}"
export DATABASE_URL="${DATABASE_URL:-postgres://forgeroom:forgeroom@127.0.0.1:5432/forgeroom}"
export FORGEROOM_E2E_OWNER_PASSWORD="${FORGEROOM_E2E_OWNER_PASSWORD:-$OWNER_PASSWORD}"
export ARTIFACT_STORAGE_DIR="${ARTIFACT_STORAGE_DIR:-$ROOT/.data/artifacts}"
mkdir -p "$ARTIFACT_STORAGE_DIR"

echo "checking TrueForge at ${TRUEFORGE_BASE_URL}…"
TF_OK=0
for _ in $(seq 1 30); do
  if curl -sf "${TRUEFORGE_BASE_URL%/}/health" >/dev/null 2>&1 \
    || curl -sf "${TRUEFORGE_BASE_URL%/}/" >/dev/null 2>&1; then
    TF_OK=1
    break
  fi
  sleep 1
done
if [[ "$TF_OK" -ne 1 ]]; then
  echo "TrueForge is not reachable at TRUEFORGE_BASE_URL=${TRUEFORGE_BASE_URL}" >&2
  echo "Start local harness: npx @truefoundry/trueforge@latest" >&2
  exit 1
fi

pnpm --filter @forgeroom/db migrate
# Full reset including synthetic provider label when credentials are present.
pnpm fixtures:reset

pnpm --filter @forgeroom/api exec tsx src/main.ts &
API_PID=$!
cleanup() {
  kill "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT

for _ in $(seq 1 90); do
  if curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null; then
    break
  fi
  sleep 1
done
curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null

exec pnpm --filter @forgeroom/web exec vite --host 127.0.0.1 --port 5173
