#!/bin/sh
# Daily logical backup for the production stack (docs/betrieb.md). This script is the backup
# service itself: it sleeps until the next full hour and dumps at BACKUP_HOUR, so no cron is needed.
# A failed run logs the reason and returns non-zero; the daemon loop keeps running.
# BACKUP_ONCE=1 runs exactly one backup and exits with its status, for the runbook and the check.
set -eu

BACKUP_HOUR=${BACKUP_HOUR:-3}
BACKUP_KEEP_DAYS=${BACKUP_KEEP_DAYS:-14}
BACKUP_DIR=/backups
DB_NAME=${EBB_DB_NAME:-ebb}

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
export PGPASSWORD="$POSTGRES_PASSWORD"
export PGUSER=postgres

log() {
  printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"
}

run_backup() {
  stamp=$(date -u '+%Y%m%dT%H%M%SZ')
  dir="$BACKUP_DIR/$stamp"
  log "run $stamp: start"

  if ! mkdir -p "$dir"; then
    log "run $stamp: cannot create $dir"
    return 1
  fi

  if ! pg_dumpall --roles-only --host postgres > "$dir/roles.sql"; then
    log "run $stamp: roles dump failed"
    return 1
  fi
  log "run $stamp: roles dumped"

  if ! pg_dump --format=custom --dbname="$DB_NAME" --host postgres > "$dir/$DB_NAME.dump"; then
    log "run $stamp: database dump failed"
    return 1
  fi
  log "run $stamp: database $DB_NAME dumped"

  # Reading the archive catches a truncated or corrupt dump before it counts as a backup.
  if ! pg_restore --list "$dir/$DB_NAME.dump" > "$dir/toc.txt"; then
    log "run $stamp: dump is not readable"
    return 1
  fi
  log "run $stamp: dump readable"

  log "run $stamp: pruning backups older than $BACKUP_KEEP_DAYS days"
  find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -mtime "+$BACKUP_KEEP_DAYS" -exec rm -rf {} + ||
    log "run $stamp: pruning old backups failed"

  log "run $stamp: done"
}

if [ "${BACKUP_ONCE:-}" = "1" ]; then
  if run_backup; then
    exit 0
  else
    exit 1
  fi
fi

while :; do
  now=$(date -u +%s)
  wait=$(( (now / 3600 + 1) * 3600 - now ))
  log "sleeping ${wait}s until the next full hour"
  sleep "$wait"
  hour=$(date -u +%H)
  # Strip the leading zero, otherwise 08 and 09 would be read as invalid octal numbers.
  if [ "${hour#0}" = "${BACKUP_HOUR#0}" ]; then
    if ! run_backup; then
      log "run failed, the loop keeps running"
    fi
  fi
done
