#!/usr/bin/env bash
# Exécute les migrations puis les tests sur une base Postgres 15 VIERGE de test.
# Usage : DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres ./supabase/tests/run.sh
# Local avec Docker : docker run -d --name pgtest -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:15
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL requis}"
cd "$(dirname "$0")"
P="psql $DATABASE_URL -v ON_ERROR_STOP=1 -q"
apply_all() {
  for m in $(ls ../migrations/*.sql | grep -v rollback | sort); do
    case "$m" in *_013_*) $P -f 02_baseline_support.sql ;; esac   # tables de support déjà présentes en production (shema.sql)
    echo ">> migration $m"; $P -f "$m"
  done
}
$P -f 00_supabase_stub.sql
$P -f 01_baseline_profiles.sql
apply_all
for t in $(ls [1-9]*_test_*.sql | sort); do echo ">> test $t"; $P -t -f "$t"; done
echo ">> idempotence : migrations rejouées"
apply_all
echo ">> retours arrière (ordre inverse) puis réapplication"
$P -c "drop table if exists public.support_messages, public.support_tickets cascade"
for m in $(ls ../migrations/*.rollback.sql | sort -r); do echo ">> retour arrière $m"; $P -f "$m"; done
apply_all
echo "TOUS LES TESTS SQL SONT PASSÉS"
