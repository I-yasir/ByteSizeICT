#!/usr/bin/env bash
# Database backup (R1.1, Plan V2.03; RUNBOOK §8). Works on the Supabase Free plan: uses the CLI's
# `supabase db dump` (pg_dump in Docker) against any Postgres URL. Writes roles.sql, schema.sql,
# data.sql (COPY format, `public` schema only) and counts.tsv (expected rows per table, used by restore-check.sh).
#
# Usage:   scripts/backup-db.sh [out_dir]          (default: backups/<UTC timestamp>)
# The URL comes from $SUPABASE_DB_URL, or from SUPABASE_DB_URL=... in $ENV_FILE
# (default .env.production.local). Use the Session pooler URI (Supabase → Connect), percent-encoded.
# Not dumped by design: pg_cron jobs and Vault secrets (re-created by migrations / RUNBOOK §2.5).
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env.production.local}"
if [[ -z "${SUPABASE_DB_URL:-}" && -f "$ENV_FILE" ]]; then
  # Read one key only; never `source` the file (values such as EMAIL_FROM=Name <addr> break the shell).
  SUPABASE_DB_URL="$(grep -E '^SUPABASE_DB_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
fi
: "${SUPABASE_DB_URL:?Set SUPABASE_DB_URL (env var or in $ENV_FILE)}"

OUT="${1:-backups/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$OUT"
chmod 700 "$OUT" # production data: keep it private to this user

dump() { pnpm exec supabase db dump --db-url "$SUPABASE_DB_URL" "$@" 2>&1 | grep -v -e 'new version of Supabase CLI' -e 'recommend updating' || true; }
echo "Dumping roles, schema and data to $OUT ..."
dump -f "$OUT/roles.sql" --role-only
dump -f "$OUT/schema.sql"
# Data from `public` only: Supabase-managed schemas (auth, storage, …) differ between cloud and local
# versions and are not used by the app (auth is off; Storage files are saved by backup-storage.ts).
dump -f "$OUT/data.sql" --data-only --use-copy -s public

for f in roles.sql schema.sql data.sql; do
  [[ -s "$OUT/$f" ]] || { echo "ERROR: $OUT/$f is missing or empty" >&2; exit 1; }
done

# Expected row counts: lines between each `COPY "schema"."table" ... FROM stdin;` and its `\.` terminator.
awk '
  /^COPY / { table = $2; gsub(/"/, "", table); n = 0; inside = 1; next }
  inside && $0 == "\\." { print table "\t" n; inside = 0; next }
  inside { n++ }
' "$OUT/data.sql" | sort > "$OUT/counts.tsv"

echo "Backup complete: $OUT"
echo "Tables: $(wc -l < "$OUT/counts.tsv")  ·  public rows: $(awk -F'\t' '$1 ~ /^public\./ { s += $2 } END { print s + 0 }' "$OUT/counts.tsv")"
