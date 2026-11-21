#!/bin/sh
# Migrate first, then hand the process over to the server: a failing migration stops the
# container instead of serving a stale schema.
set -e
node scripts/migrate.ts
exec node src/server/index.ts
