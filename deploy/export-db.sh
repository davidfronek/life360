#!/usr/bin/env bash
# Exportuje databazi Life360 do SQL souboru pro presun na jiny server.
#
#   ./export-db.sh                       jen struktura (+ evidence migraci)  -> life360-schema.sql
#   ./export-db.sh --with-data           vcetne dat (bez tabulky settings)   -> life360-data.sql
#   ./export-db.sh --with-data --include-settings   i se sifrovanym Life360 tokenem (nutny stejny TOKEN_ENCRYPTION_KEY)
#   ./export-db.sh --out soubor.sql      vlastni cilovy soubor
# Pripojeni se bere z DATABASE_URL (prostredi nebo ../.env).
set -euo pipefail
cd "$(dirname "$0")"

with_data=0; include_settings=0; out=""
while [ $# -gt 0 ]; do
  case "$1" in
    --with-data) with_data=1 ;;
    --include-settings) include_settings=1 ;;
    --out) shift; out="$1" ;;
    *) echo "Neznamy parametr: $1" >&2; exit 2 ;;
  esac
  shift
done

if [ -z "${DATABASE_URL:-}" ] && [ -f ../.env ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' ../.env | head -n1 | cut -d= -f2-)"
fi
: "${DATABASE_URL:?DATABASE_URL neni nastaveno}"
if [ -z "$out" ]; then
  if [ "$with_data" = 1 ]; then out=life360-data.sql; else out=life360-schema.sql; fi
fi

tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
common=(--no-owner --no-privileges --no-comments "$DATABASE_URL")

if [ "$with_data" = 1 ]; then
  extra=(--inserts --column-inserts)
  [ "$include_settings" = 1 ] || extra+=(--exclude-table-data=settings)
  pg_dump "${extra[@]}" "${common[@]}" > "$tmp"
else
  pg_dump --schema-only "${common[@]}" > "$tmp"
  # Evidence provedenych migraci, aby je aplikace po importu neprovadela znovu
  pg_dump --data-only --inserts --column-inserts --table=schema_migrations "${common[@]}" >> "$tmp"
fi

# Vystup nove verze pg_dump jde importovat i do starsich serveru (PostgreSQL 14+)
grep -Ev '^(\\restrict|\\unrestrict) |^SET transaction_timeout' "$tmp" > "$out"
echo "Export hotov: $out ($(du -k "$out" | cut -f1) kB)"
