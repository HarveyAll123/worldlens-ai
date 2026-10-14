#!/usr/bin/env bash
# Applies supabase/migrations to a throwaway local PostgreSQL + PostGIS cluster and runs
# smoke checks for the query functions, constraints and RLS. Requires postgres + postgis.
#   pnpm test:db
set -euo pipefail
PGBIN=${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}
DIR=$(mktemp -d)
PORT=${PGPORT_TEST:-55432}
cleanup() { $RUN "$PGBIN/pg_ctl" -D "$DIR" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
if [ "$(id -u)" = "0" ]; then
  chown -R postgres "$DIR"; RUN="runuser -u postgres --"
else
  RUN=""
fi
trap cleanup EXIT
$RUN "$PGBIN/initdb" -D "$DIR" -U postgres -A trust >/dev/null
$RUN "$PGBIN/pg_ctl" -D "$DIR" -o "-p $PORT -k $DIR" -l "$DIR/log" start >/dev/null
sleep 1
PSQL="psql -h $DIR -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -c "create database worldlens_test"
# Supabase-provided roles used by RLS policies.
$PSQL -d worldlens_test -c "do \$\$ begin create role anon nologin; create role authenticated nologin; exception when duplicate_object then null; end \$\$;"
for f in supabase/migrations/*.sql; do
  echo "applying $f"
  $PSQL -d worldlens_test -f "$f"
done
$PSQL -d worldlens_test -f supabase/tests/smoke.sql
echo "✓ migrations and smoke checks passed"
