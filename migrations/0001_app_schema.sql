-- E1-P2: schema for helper functions, privileges for the request and system roles.
-- Runs as ebb_owner (owner of the database and therefore of schema public).

CREATE SCHEMA app;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO ebb_app, ebb_system;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO ebb_app, ebb_system, ebb_auth;

-- The current user of a request, set per transaction by withUser(). NULL outside of it.
CREATE FUNCTION app.uid() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.user_id', true), '') $$;

REVOKE ALL ON FUNCTION app.uid() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.uid() TO ebb_app, ebb_system;

-- Every table ebb_owner creates from here on is usable by the request and system roles.
-- RLS (ENABLE + FORCE) is still required per table; auth tables revoke these grants again (0002).
ALTER DEFAULT PRIVILEGES FOR ROLE ebb_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ebb_app, ebb_system;
ALTER DEFAULT PRIVILEGES FOR ROLE ebb_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ebb_app, ebb_system;
ALTER DEFAULT PRIVILEGES FOR ROLE ebb_owner IN SCHEMA app
  GRANT EXECUTE ON FUNCTIONS TO ebb_app, ebb_system;
