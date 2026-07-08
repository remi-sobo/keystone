#!/usr/bin/env bash
# The Keystone cross-practice / cross-client RLS leak test (Ring 1).
# Pattern from BloomOS scripts/test-rls.sh.
#
# Applies every migration to a scratch Postgres (with the Supabase
# platform bits stubbed) and then asserts the two-level access matrix:
# owner / consultant / client member A1 / client member A2 / client
# member B / stranger / anon each see exactly what their scope permits.
# Run by CI (.github/workflows/rls-test.yml); runnable locally against
# any DISPOSABLE database:
#
#   DATABASE_URL=postgresql://postgres@localhost:5432/scratch scripts/test-rls.sh
#
# NEVER point this at production: it creates test users and seed rows.
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL to a DISPOSABLE scratch Postgres}"

root="$(cd "$(dirname "$0")/.." && pwd)"
mig="$root/supabase/migrations"
run() { psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -f "$1"; }

echo "== Stubbing the Supabase platform (auth schema, roles)"
run "$root/supabase/tests/setup-supabase-stub.sql"

echo "== Applying migrations in filename order"
for f in $(ls "$mig"/*.sql | sort); do
  echo "   $(basename "$f")"
  run "$f"
done

echo "== Running the isolation matrix"
run "$root/supabase/tests/isolation-seed.sql"

echo "== PASS: no leaks"
