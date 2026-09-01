#!/usr/bin/env bash
# Per-boot runtime initialization for Cursor Cloud Agents.
# Starts the local PostgreSQL cluster and ensures the forgeroom role/database
# exist. Safe to run repeatedly. Application migrations run automatically when
# the API boots (Postgres auth store), so this script only prepares the server.
set -euo pipefail

cd "$(dirname "$0")/.."

# Start the PostgreSQL cluster if it is not already online.
if ! sudo pg_lsclusters -h 2>/dev/null | awk '{print $4}' | grep -q '^online$'; then
  echo "[start] Starting PostgreSQL cluster..."
  sudo pg_ctlcluster 16 main start || true
else
  echo "[start] PostgreSQL cluster already online."
fi

# Wait for the server to accept connections.
for _ in $(seq 1 30); do
  if sudo -u postgres pg_isready -q; then
    break
  fi
  sleep 1
done

# Ensure the application role exists.
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='forgeroom'" | grep -q 1; then
  echo "[start] Creating forgeroom role..."
  sudo -u postgres psql -c "CREATE ROLE forgeroom LOGIN PASSWORD 'forgeroom';"
fi

# Ensure the application database exists.
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='forgeroom'" | grep -q 1; then
  echo "[start] Creating forgeroom database..."
  sudo -u postgres createdb -O forgeroom forgeroom
fi

echo "[start] PostgreSQL ready at postgres://forgeroom:forgeroom@127.0.0.1:5432/forgeroom"
