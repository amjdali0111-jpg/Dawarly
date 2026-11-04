#!/usr/bin/env bash
# Creates a throw-away local Postgres (>=15) cluster, loads the Supabase stub and
# applies every migration in order. Used by `npm run test:db`.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA="${TEST_PGDATA:-$ROOT/.pgtest}"
PORT="${TEST_PGPORT:-54329}"
RUN_AS=""
if [ "$(id -u)" = "0" ]; then RUN_AS="runuser -u postgres --"; fi

if [ -f "$DATA/postmaster.pid" ]; then $RUN_AS "$PGBIN/pg_ctl" -D "$DATA" stop -m fast >/dev/null || true; fi
rm -rf "$DATA"; mkdir -p "$DATA"
[ -n "$RUN_AS" ] && chown postgres "$DATA"
$RUN_AS "$PGBIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
$RUN_AS "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp -c listen_addresses=localhost" -l "$DATA/log" start >/dev/null
for _ in $(seq 1 30); do "$PGBIN/pg_isready" -h localhost -p "$PORT" >/dev/null 2>&1 && break; sleep 0.5; done

PSQL=(psql -X -q -v ON_ERROR_STOP=1 -h localhost -p "$PORT" -U postgres)
"${PSQL[@]}" -c "create database dawarly_test" >/dev/null
"${PSQL[@]}" -d dawarly_test -f "$ROOT/tests/db/supabase-stub.sql" >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "applying $(basename "$f")"
  "${PSQL[@]}" -d dawarly_test -f "$f" >/dev/null
done
echo "test database ready: postgres://postgres@localhost:$PORT/dawarly_test"
