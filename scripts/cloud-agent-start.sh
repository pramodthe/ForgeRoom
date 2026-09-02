#!/usr/bin/env bash
# Per-boot runtime initialization for Cursor Cloud Agents.
# Starts the local PostgreSQL cluster and ensures the forgeroom role/database
# exist. Safe to run repeatedly. Application migrations run automatically when
# the API boots (Postgres auth store), so this script only prepares the server.
set -euo pipefail

cd "$(dirname "$0")/.."

# Resolve the cluster to manage from pg_lsclusters instead of hard-coding a
# version. Prefer major 16 (matching infra/compose.yaml) but fall back to the
# first installed cluster so the script keeps working if the base image ships a
# different PostgreSQL version.
read -r PG_VER PG_CLUSTER <<EOF
$(sudo pg_lsclusters -h 2>/dev/null | awk '$1==16 {print $1, $2; found=1; exit} {if (!seen) {v=$1; c=$2; seen=1}} END {if (!found && seen) print v, c}')
EOF

if [ -z "${PG_VER:-}" ] || [ -z "${PG_CLUSTER:-}" ]; then
  echo "[start] No PostgreSQL cluster found; run scripts/cloud-agent-install.sh first." >&2
  exit 1
fi

# Start the cluster if it is not already online.
cluster_status() {
  sudo pg_lsclusters -h 2>/dev/null \
    | awk -v v="$PG_VER" -v c="$PG_CLUSTER" '$1==v && $2==c {print $4}'
}
if [ "$(cluster_status)" != "online" ]; then
  echo "[start] Starting PostgreSQL cluster ${PG_VER}/${PG_CLUSTER}..."
  sudo pg_ctlcluster "$PG_VER" "$PG_CLUSTER" start || true
else
  echo "[start] PostgreSQL cluster ${PG_VER}/${PG_CLUSTER} already online."
fi

# Wait for the server to accept connections.
for _ in $(seq 1 30); do
  if sudo -u postgres pg_isready -q; then
    break
  fi
  sleep 1
done

# Ensure the application role exists. The official postgres Docker image used by
# infra/compose.yaml makes POSTGRES_USER a SUPERUSER; match that so the
# @forgeroom/db test-harness can create/drop fresh temporary databases and
# terminate their backends (pg_terminate_backend) between integration tests.
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='forgeroom'" | grep -q 1; then
  echo "[start] Creating forgeroom role..."
  sudo -u postgres psql -c "CREATE ROLE forgeroom LOGIN SUPERUSER CREATEDB PASSWORD 'forgeroom';"
else
  sudo -u postgres psql -c "ALTER ROLE forgeroom SUPERUSER CREATEDB;" >/dev/null
fi

# Ensure the application database exists.
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='forgeroom'" | grep -q 1; then
  echo "[start] Creating forgeroom database..."
  sudo -u postgres createdb -O forgeroom forgeroom
fi

echo "[start] PostgreSQL ready at postgres://forgeroom:forgeroom@127.0.0.1:5432/forgeroom"
