#!/bin/sh
# Restore one backup folder from docker/backup/backup.sh into an empty instance, following
# docs/betrieb.md:
#   docker compose -f docker-compose.prod.yml run --rm --entrypoint sh backup \
#     /backup/restore.sh /backups/<stamp>
# The fresh postgres already created the four ebb_* roles, so roles.sql only adds missing ones.
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: restore.sh <backup-folder>" >&2
  exit 2
fi

dir=$1
DB_NAME=${EBB_DB_NAME:-ebb}

: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
export PGPASSWORD="$POSTGRES_PASSWORD"
export PGUSER=postgres

log() {
  printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"
}

if [ ! -f "$dir/roles.sql" ] || [ ! -f "$dir/$DB_NAME.dump" ]; then
  log "restore: $dir is not a complete backup (roles.sql and $DB_NAME.dump are required)"
  exit 1
fi

existing=$(mktemp)
filtered=$(mktemp)
trap 'rm -f "$existing" "$filtered"' EXIT

log "restore: applying missing roles from $dir/roles.sql"
psql --host postgres --dbname postgres --no-align --tuples-only \
  --command 'select rolname from pg_roles' > "$existing"

# The init script of a fresh instance already creates the four ebb_* roles with its own passwords.
# Replaying their CREATE ROLE would fail, so only roles the target does not know are applied.
# shortcut: plain role names only; a quoted name with spaces would need a real SQL parser.
awk -v existing="$existing" '
  BEGIN { while ((getline name < existing) > 0) have[name] = 1 }
  /^(CREATE|ALTER) ROLE / {
    name = $3
    sub(/;.*/, "", name)
    gsub(/"/, "", name)
    if (name in have) next
  }
  { print }
' "$dir/roles.sql" > "$filtered"
psql --host postgres --dbname postgres --set ON_ERROR_STOP=1 --file "$filtered" > /dev/null
log "restore: roles applied"

log "restore: restoring database $DB_NAME from $dir/$DB_NAME.dump"
pg_restore --host postgres --dbname "$DB_NAME" --exit-on-error "$dir/$DB_NAME.dump"
log "restore: database restored"

for table in '"user"' task space; do
  count=$(psql --host postgres --dbname "$DB_NAME" --no-align --tuples-only \
    --command "select count(*) from $table")
  log "$table: $count"
done

log "restore: done"
