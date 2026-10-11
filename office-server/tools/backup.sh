#!/bin/sh
# Daily backup of the database and the PDF folder into /backups; old backups are removed after BACKUP_KEEP_DAYS.
# With --loop it checks every hour and makes at most one backup per day.
set -eu
keep=${BACKUP_KEEP_DAYS:-14}
out=${BACKUP_DIR:-/backups}; data=${DATA_DIR:-/data}
run() {
  day=$(date +%Y-%m-%d)
  [ -f "$out/mawatheeq-$day.dump" ] && return 0
  until pg_isready -q; do sleep 2; done
  pg_dump -Fc -f "$out/mawatheeq-$day.dump.part" && mv "$out/mawatheeq-$day.dump.part" "$out/mawatheeq-$day.dump"
  tar -czf "$out/files-$day.tar.gz.part" -C "$data" files && mv "$out/files-$day.tar.gz.part" "$out/files-$day.tar.gz"
  find "$out" -maxdepth 1 \( -name 'mawatheeq-*.dump' -o -name 'files-*.tar.gz' \) -mtime +"$keep" -delete
  echo "Backup $day done."
}
if [ "${1:-}" = "--loop" ]; then while true; do run || echo "Backup failed; retrying in an hour."; sleep 3600; done; else run; fi
