#!/bin/sh
# Restores a backup made by backup.sh: docker compose run --rm restore 2026-10-11
# Replaces the current database and PDFs with that day's copies. Stop the web service first.
set -eu
day=${1:?Give the backup date, for example: docker compose run --rm restore 2026-10-11}
out=${BACKUP_DIR:-/backups}; data=${DATA_DIR:-/data}
dump="$out/mawatheeq-$day.dump"; files="$out/files-$day.tar.gz"
[ -f "$dump" ] || { echo "Not found: $dump"; exit 1; }
until pg_isready -q; do sleep 1; done
pg_restore --clean --if-exists --no-owner --exit-on-error -d "$PGDATABASE" "$dump"
if [ -f "$files" ]; then rm -rf "${data:?}/files/documents"; tar -xzf "$files" -C "$data"; fi
echo "Restored $day. Start the server again with start.bat or start.sh."
