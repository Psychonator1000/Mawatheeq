#!/bin/sh
# One-time move from the hosted database: copies every record and original PDF into this office server.
# Needs SUPABASE_DB_URL, SUPABASE_URL and SUPABASE_SECRET_KEY in .env (see README.md). Run: docker compose run --rm import
set -eu
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
: "${SUPABASE_DB_URL:?Add SUPABASE_DB_URL to .env (Supabase → Connect → Session pooler connection string)}"
until pg_isready -q; do sleep 1; done
work=$(mktemp -d)
tables="select format('%I.%I', schemaname, tablename) from pg_tables where schemaname = 'mawatheeq_private' or (schemaname = 'public' and tablename like 'mawatheeq\_%')"

existing=$(psql -X -t -A -c "select count(*) from mawatheeq_private.accounts")
if [ "$existing" != "0" ] && [ "${FORCE:-}" != "1" ]; then
  echo "This server already has $existing account(s). To replace everything with the hosted data, run again with FORCE=1:"
  echo "  docker compose run --rm -e FORCE=1 import"; exit 1
fi

echo "1/4 Reading records from the hosted database…"
# Only tables that exist on both sides are copied; tables added by migrations not yet applied there stay empty.
psql -X -t -A -c "$tables" | sort > "$work/local.txt"
psql -X -t -A "$SUPABASE_DB_URL" -c "$tables" | sort > "$work/remote.txt"
comm -12 "$work/local.txt" "$work/remote.txt" > "$work/both.txt"
args=""; while read -r t; do args="$args --table=$t"; done < "$work/both.txt"
# shellcheck disable=SC2086
# Circular-reference warnings are expected: the data is loaded with reference checks paused, as one transaction.
pg_dump "$SUPABASE_DB_URL" --data-only --no-owner --no-privileges $args -f "$work/data.sql" 2> "$work/dump.log" || { cat "$work/dump.log"; exit 1; }

echo "2/4 Replacing the records on this server…"
# Tables that exist only here (e.g. attendance, if not yet applied on the hosted side) are emptied by the cascade;
# the attendance settings row is kept so the feature keeps working.
keep=$(psql -X -t -A -c "select to_regclass('mawatheeq_private.att_settings') is not null")
{ echo "begin;"; echo "set session_replication_role = replica;"
  [ "$keep" = "t" ] && ! grep -qx 'mawatheeq_private.att_settings' "$work/both.txt" && echo "create temp table keep_settings as select id, payload, revision from mawatheeq_private.att_settings;"
  echo "truncate $(paste -sd, "$work/both.txt") cascade;"
  cat "$work/data.sql"
  [ "$keep" = "t" ] && ! grep -qx 'mawatheeq_private.att_settings' "$work/both.txt" && echo "insert into mawatheeq_private.att_settings(id, payload, revision) select id, payload, revision from keep_settings on conflict (id) do nothing;"
  echo "set session_replication_role = origin;"; echo "commit;"; } | psql -X -q -v ON_ERROR_STOP=1 >/dev/null

echo "3/4 Copying original PDF files…"
psql -X -t -A "$SUPABASE_DB_URL" -c "select name from storage.objects where bucket_id = 'mawatheeq-documents' order by name" > "$work/files.txt"
node /repo/office-server/tools/download-files.mjs "$work/files.txt"
psql -X -q -v ON_ERROR_STOP=1 -c "delete from storage.objects where bucket_id = 'mawatheeq-documents'"
while read -r name; do [ -f "${DATA_DIR:-/data}/files/$name" ] && printf "insert into storage.objects(bucket_id, name) values ('mawatheeq-documents', :'n') on conflict do nothing;\n" | psql -X -q -v n="$name"; done < "$work/files.txt"

echo "4/4 Checking…"
psql -X -c "select (select count(*) from mawatheeq_private.accounts) accounts, (select count(*) from storage.objects) pdf_files"
rm -rf "$work"
echo "Import finished. Sign in with the same usernames and passwords, check the data, then remove the SUPABASE_* lines from .env."
