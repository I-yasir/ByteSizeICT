#!/usr/bin/env bash
# Restore drill (R1.1, Plan V2.03; RUNBOOK §8): restores a backup made by backup-db.sh into a
# throwaway, isolated local Supabase stack (own ports, no migrations, no seed) and compares the
# row count of every `public` table with counts.tsv. Never touches the dev stack or production.
#
# Usage:  scripts/restore-check.sh <backup_dir>      (KEEP=1 leaves the stack running on :54622)
set -euo pipefail

BACKUP="${1:?Usage: scripts/restore-check.sh <backup_dir>}"
for f in roles.sql schema.sql data.sql counts.tsv; do
  [[ -s "$BACKUP/$f" ]] || { echo "ERROR: $BACKUP/$f missing" >&2; exit 1; }
done

REPO="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/bsi-restore-XXXXXX")"
PROJECT=bytesizeict-restore
mkdir -p "$WORK/supabase"
# Same config as the app, shifted ports (+300), seed and Studio off; no migrations dir → empty public schema.
sed -e "s/^project_id = .*/project_id = \"$PROJECT\"/" \
    -e 's/^port = 54321/port = 54621/' -e 's/^port = 54322/port = 54622/' -e 's/^shadow_port = 54320/shadow_port = 54620/' \
    -e 's/^port = 54329/port = 54629/' -e 's/^port = 54323/port = 54623/' -e 's/^port = 54324/port = 54624/' \
    -e 's/^port = 54327/port = 54627/' \
    "$REPO/supabase/config.toml" > "$WORK/supabase/config.toml"
python3 - "$WORK/supabase/config.toml" <<'PY'
import re, sys
p = sys.argv[1]; s = open(p).read()
for section in ('db.seed', 'studio'):
    s = re.sub(r'(\[' + re.escape(section) + r'\]\n(?:#.*\n|\s*\n)*?enabled = )true', r'\1false', s)
open(p, 'w').write(s)
PY

cleanup() {
  if [[ "${KEEP:-0}" != "1" ]]; then
    (cd "$REPO" && pnpm exec supabase stop --no-backup --workdir "$WORK" >/dev/null 2>&1) || true
    rm -rf "$WORK"
  else
    echo "KEEP=1: stack left running (db port 54622, workdir $WORK)"
  fi
}
trap cleanup EXIT

echo "Starting isolated stack ($PROJECT) ..."
(cd "$REPO" && pnpm exec supabase start --workdir "$WORK" >/dev/null 2>&1)
DB="supabase_db_$PROJECT"
psql_in() { docker exec -i "$DB" psql -U postgres -d postgres -q "$@"; }

echo "Restoring roles, schema, data from $BACKUP ..."
psql_in -v ON_ERROR_STOP=0 < "$BACKUP/roles.sql" >/dev/null 2>&1 || true   # roles may already exist
psql_in -v ON_ERROR_STOP=1 < "$BACKUP/schema.sql" >/dev/null
# Only `public` data: older backups also contain Supabase-managed schemas (auth, storage, …) whose
# columns differ between Supabase cloud and the local stack, and the app does not use them.
public_data() {
  awk '
    /^COPY / { inblock = 1; keep = ($2 ~ /^"?public"?\./) }
    inblock { if (keep) print; if ($0 == "\\.") inblock = 0; next }
    /pg_catalog\.setval\(/ { if ($0 ~ /setval\(\x27"?public"?\./) print; next }
    { print }
  ' "$BACKUP/data.sql"
}
{ echo 'SET session_replication_role = replica;'; public_data; } | psql_in -v ON_ERROR_STOP=1 --single-transaction >/dev/null

echo "Comparing row counts ..."
fail=0
while IFS=$'\t' read -r table expected; do
  actual="$(docker exec "$DB" psql -U postgres -d postgres -tAc "select count(*) from $table")"
  if [[ "$actual" != "$expected" ]]; then
    echo "MISMATCH $table: expected $expected, restored $actual"; fail=1
  fi
done < <(grep -E '^public\.' "$BACKUP/counts.tsv")

tables="$(grep -cE '^public\.' "$BACKUP/counts.tsv")"
rows="$(awk -F'\t' '$1 ~ /^public\./ { s += $2 } END { print s + 0 }' "$BACKUP/counts.tsv")"
if [[ $fail -eq 0 ]]; then
  echo "RESTORE OK: $tables public tables, $rows rows match the backup."
else
  echo "RESTORE FAILED: see mismatches above." >&2; exit 1
fi
