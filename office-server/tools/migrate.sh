#!/bin/sh
# Prepares the database, then applies every migration in supabase/migrations that has not been applied yet.
set -eu
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
until pg_isready -q; do sleep 1; done
psql -X -q -v ON_ERROR_STOP=1 -v auth_pw="$AUTHENTICATOR_PASSWORD" -v files_secret="$FILES_SECRET" -f /repo/office-server/db/bootstrap.sql
for f in /repo/supabase/migrations/*.sql; do
  name=$(basename "$f")
  applied=$(printf "select 1 from office.migrations where name = :'name';" | psql -X -t -A -v ON_ERROR_STOP=1 -v name="$name")
  if [ -z "$applied" ]; then
    echo "Applying $name"
    psql -X -q -v ON_ERROR_STOP=1 -f "$f"
    printf "insert into office.migrations(name) values (:'name');" | psql -X -q -v ON_ERROR_STOP=1 -v name="$name"
  fi
done
psql -X -q -c "notify pgrst, 'reload schema'"
echo "Database ready."
