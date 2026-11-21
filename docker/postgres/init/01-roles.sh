#!/bin/sh
# Runs once on an empty data directory (docker-entrypoint-initdb.d).
# Creates the four roles from docs/architektur.md and the app database. Passwords come from the
# environment, never from the repo. scripts/test-setup.ts applies the same rules for test databases.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v owner_pw="$EBB_OWNER_PASSWORD" \
  -v app_pw="$EBB_APP_PASSWORD" \
  -v system_pw="$EBB_SYSTEM_PASSWORD" \
  -v auth_pw="$EBB_AUTH_PASSWORD" \
  -v db_name="$EBB_DB_NAME" <<'SQL'
SELECT format('CREATE ROLE ebb_owner LOGIN PASSWORD %L', :'owner_pw')
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ebb_owner') \gexec
SELECT format('CREATE ROLE ebb_app LOGIN NOBYPASSRLS PASSWORD %L', :'app_pw')
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ebb_app') \gexec
SELECT format('CREATE ROLE ebb_system LOGIN BYPASSRLS PASSWORD %L', :'system_pw')
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ebb_system') \gexec
SELECT format('CREATE ROLE ebb_auth LOGIN NOBYPASSRLS PASSWORD %L', :'auth_pw')
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ebb_auth') \gexec
SELECT format('CREATE DATABASE %I OWNER ebb_owner', :'db_name')
  WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db_name') \gexec
SQL
