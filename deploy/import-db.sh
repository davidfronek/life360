#!/usr/bin/env bash
# Naimportuje SQL export (struktura, pripadne i data) do cilove databaze.
#
# Postup na novem serveru (jako superuzivatel PostgreSQL):
#   createuser life360 --pwprompt
#   createdb -O life360 life360
#   psql -d life360 -c "CREATE EXTENSION IF NOT EXISTS postgis;"     # vyzaduje superuzivatele
# Pote (jako bezny uzivatel life360):
#   ./import-db.sh life360-schema.sql "postgres://life360:HESLO@localhost:5432/life360"
set -euo pipefail

file="${1:?Pouziti: ./import-db.sh soubor.sql [DATABASE_URL]}"
url="${2:-${DATABASE_URL:-}}"
: "${url:?Zadejte DATABASE_URL jako druhy parametr nebo promennou prostredi}"

# Import probehne v jedne transakci; pri chybe se nic nezmeni
psql "$url" -v ON_ERROR_STOP=1 -1 -f "$file"
echo "Import hotov."
