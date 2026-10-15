#!/usr/bin/env bash
set -euo pipefail
tracker_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
tracker_backups="$tracker_root/backups"
mkdir -p "$tracker_backups"
chmod 700 "$tracker_backups"
exec 9>"$tracker_backups/.backup.lock"
flock -n 9 || exit 0
tracker_backup_path=$(docker exec rl-tracker-bot bun run scripts/backup.ts | tail -n 1)
case "$tracker_backup_path" in /app/backups/rl-tracker-*.sqlite) ;; *) echo 'Unexpected backup output' >&2; exit 1;; esac
tracker_backup_name=$(basename -- "$tracker_backup_path")
docker cp "rl-tracker-bot:$tracker_backup_path" "$tracker_backups/$tracker_backup_name"
chmod 600 "$tracker_backups/$tracker_backup_name"
docker exec rl-tracker-bot rm -- "$tracker_backup_path"
find "$tracker_backups" -maxdepth 1 -type f -name 'rl-tracker-*.sqlite' -mtime +14 -delete
printf '%s Saved %s\n' "$(date --iso-8601=seconds)" "$tracker_backup_name"
