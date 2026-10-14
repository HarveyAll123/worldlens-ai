#!/usr/bin/env bash
# Creates a throwaway local PostgreSQL + PostGIS cluster, applies db/migrations and db/grants.sql
# with the real migration runner (scripts/db-migrate.ts), runs the SQL smoke checks, then runs
# the API's Postgres repository integration tests connected as the least-privilege API role.
# Requires postgres + postgis binaries (Neon runs the same SQL).
#   pnpm test:db
set -euo pipefail
PGBIN=${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}
DIR=$(mktemp -d)
PORT=${PGPORT_TEST:-55432}
if [ "$(id -u)" = "0" ]; then
  chown -R postgres "$DIR"; RUN="runuser -u postgres --"
else
  RUN=""
fi
cleanup() { $RUN "$PGBIN/pg_ctl" -D "$DIR" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
$RUN "$PGBIN/initdb" -D "$DIR" -U postgres -A trust >/dev/null
$RUN "$PGBIN/pg_ctl" -D "$DIR" -o "-p $PORT -k $DIR -c listen_addresses=127.0.0.1" -l "$DIR/log" start >/dev/null
sleep 1
PSQL="psql -h $DIR -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -c "create database worldlens_test"
# The API role, as created on Neon with SQL (see db/grants.sql).
$PSQL -d worldlens_test -c "create role worldlens_app login"

OWNER_URL="postgresql://postgres@127.0.0.1:$PORT/worldlens_test"
MIGRATION_DATABASE_URL="$OWNER_URL" npx tsx scripts/db-migrate.ts
# Second run must be a no-op apart from re-applying grants.
MIGRATION_DATABASE_URL="$OWNER_URL" npx tsx scripts/db-migrate.ts | grep -q '+ ' && { echo "migrations re-applied"; exit 1; }

$PSQL -d worldlens_test -f db/tests/smoke.sql
echo "✓ migrations and smoke checks passed"

WORLDLENS_TEST_DATABASE_URL="postgresql://worldlens_app@127.0.0.1:$PORT/worldlens_test" \
  npx vitest run --project api apps/api/src/data/postgres.integration.test.ts
echo "✓ repository integration tests passed (as worldlens_app)"
