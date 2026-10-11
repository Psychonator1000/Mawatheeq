#!/bin/sh
# Creates the office owner account (only when no owner exists yet): docker compose run --rm admin
set -eu
until pg_isready -q; do sleep 1; done
if [ -n "$(psql -X -t -A -c "select 1 from public.mawatheeq_members where role = 'owner' limit 1")" ]; then
  echo "An owner account already exists. Manage accounts from the app settings."; exit 1
fi
printf 'Username (English letters/numbers, at least 3): '; read -r user
printf 'Password (at least 12 characters): '; stty -echo 2>/dev/null || true; read -r pass; stty echo 2>/dev/null || true; echo
[ ${#pass} -ge 12 ] || { echo "The password must be at least 12 characters."; exit 1; }
printf "begin;
insert into mawatheeq_private.accounts(username, password_hash, must_change_password) values (lower(:'u'), extensions.crypt(:'p', extensions.gen_salt('bf', 10)), false);
insert into public.mawatheeq_members(user_id, role) select id, 'owner' from mawatheeq_private.accounts where username = lower(:'u');
commit;" | psql -X -q -v ON_ERROR_STOP=1 -v u="$user" -v p="$pass"
echo "Owner account '$user' created. Sign in from the browser."
