#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
for binary in initdb pg_ctl psql python3; do command -v "$binary" >/dev/null; done
test_db_dir=$(mktemp -d "${TMPDIR:-/tmp}/ca-reading-db.XXXXXX")
test_db_port=$(python3 - <<'PY'
import socket
with socket.socket() as s:
    s.bind(('127.0.0.1', 0))
    print(s.getsockname()[1])
PY
)
cleanup() {
  pg_ctl -D "$test_db_dir/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$test_db_dir"
}
trap cleanup EXIT
initdb -D "$test_db_dir/data" -A trust -U postgres >/dev/null
pg_ctl -D "$test_db_dir/data" -l "$test_db_dir/postgres.log" -o "-h 127.0.0.1 -p $test_db_port -k $test_db_dir" start >/dev/null
psql "postgresql://postgres@127.0.0.1:$test_db_port/postgres" -X -v ON_ERROR_STOP=1 -q -f tests/reading-bootstrap.sql
psql "postgresql://postgres@127.0.0.1:$test_db_port/postgres" -X -v ON_ERROR_STOP=1 -q -f supabase/migrations/20260917230433_private_reading_history.sql
psql "postgresql://postgres@127.0.0.1:$test_db_port/postgres" -X -v ON_ERROR_STOP=1 -q -f tests/reading-history.sql
echo "Private history PostgreSQL checks passed (isolated disposable database)."
