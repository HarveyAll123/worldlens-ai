#!/usr/bin/env bash
# Creates a throwaway local PostgreSQL + PostGIS cluster, applies db/migrations and db/grants.sql
# with the real migration runner (scripts/db-migrate.ts), runs the SQL smoke checks, then runs
# the API's Postgres repository integration tests connected as the least-privilege API role.
# Requires PostgreSQL server binaries and PostGIS (Neon runs the same SQL).
#   pnpm test:db                         # Debian/Ubuntu layout, or pg_ctl on PATH (Homebrew)
#   PGBIN=/path/to/postgres/bin pnpm test:db
set -euo pipefail

if [ -z "${PGBIN:-}" ]; then
  for d in /usr/lib/postgresql/*/bin; do [ -x "$d/initdb" ] && PGBIN=$d; done  # newest wins
fi
if [ -z "${PGBIN:-}" ] && command -v pg_ctl >/dev/null 2>&1; then
  PGBIN=$(dirname "$(command -v pg_ctl)")
fi
if [ -z "${PGBIN:-}" ] || [ ! -x "$PGBIN/initdb" ]; then
  echo "PostgreSQL server binaries not found. Install PostgreSQL + PostGIS, or set PGBIN to the directory containing initdb and pg_ctl." >&2
  exit 1
fi

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
$RUN "$PGBIN/pg_ctl" -D "$DIR" -o "-p $PORT -k $DIR -c listen_addresses=127.0.0.1" -l "$DIR/log" -w start >/dev/null
PSQL="$PGBIN/psql -h $DIR -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -d postgres -c "create database worldlens_test"
# The API role, as created on Neon with SQL (see db/grants.sql).
$PSQL -d worldlens_test -c "create role worldlens_app login"

OWNER_URL="postgresql://postgres@127.0.0.1:$PORT/worldlens_test"
MIGRATION_DATABASE_URL="$OWNER_URL" npx tsx scripts/db-migrate.ts
# A second run must succeed and apply no migration (grants are re-applied).
second=$(MIGRATION_DATABASE_URL="$OWNER_URL" npx tsx scripts/db-migrate.ts)
if grep -q '^  + ' <<<"$second"; then
  echo "second db:migrate run re-applied migrations:" >&2
  echo "$second" >&2
  exit 1
fi

$PSQL -d worldlens_test -f db/tests/smoke.sql
echo "✓ migrations and smoke checks passed"

WORLDLENS_TEST_DATABASE_URL="postgresql://worldlens_app@127.0.0.1:$PORT/worldlens_test" \
  npx vitest run --project api apps/api/src/data/postgres.integration.test.ts
echo "✓ repository integration tests passed (as worldlens_app)"
