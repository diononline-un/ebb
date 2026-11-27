-- E9-P1: web push subscriptions (E9-P2 sends the reminders through them). The VAPID keys live in the
-- environment per deployment (src/server/env.ts), so this table carries no instance configuration.
--
-- The request role may only read and delete its own rows. Writing goes through
-- app.save_push_subscription(): one browser endpoint belongs to the person signed in now, so a device
-- that changes hands must not keep delivering the previous person's reminders.

CREATE TABLE push_subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT app.uid() REFERENCES "user" (id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE CHECK (endpoint LIKE 'https://%' AND char_length(endpoint) <= 2048),
  p256dh text NOT NULL CHECK (char_length(p256dh) BETWEEN 1 AND 200),
  auth text NOT NULL CHECK (char_length(auth) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz
);

ALTER TABLE push_subscription ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscription FORCE ROW LEVEL SECURITY;

CREATE POLICY push_read_own ON push_subscription FOR SELECT TO ebb_app USING (user_id = app.uid());
CREATE POLICY push_delete_own ON push_subscription FOR DELETE TO ebb_app USING (user_id = app.uid());
REVOKE INSERT, UPDATE ON push_subscription FROM ebb_app;

-- FORCE RLS binds the owner too, and the definer function below runs as ebb_owner: these three
-- policies are what it needs to find a stale endpoint (the scan of a delete reads the row), drop it
-- and insert the row for app.uid().
CREATE POLICY push_read_definer ON push_subscription FOR SELECT TO ebb_owner USING (true);
CREATE POLICY push_insert_definer ON push_subscription FOR INSERT TO ebb_owner
  WITH CHECK (user_id = app.uid());
CREATE POLICY push_delete_definer ON push_subscription FOR DELETE TO ebb_owner USING (true);

CREATE FUNCTION app.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF app.uid() IS NULL THEN
    RAISE EXCEPTION 'no_user';
  END IF;
  -- The same endpoint under another person is the same browser; the older row goes without a word.
  DELETE FROM push_subscription WHERE endpoint = p_endpoint;
  INSERT INTO push_subscription (endpoint, p256dh, auth) VALUES (p_endpoint, p_p256dh, p_auth);
END
$$;

REVOKE ALL ON FUNCTION app.save_push_subscription(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.save_push_subscription(text, text, text) TO ebb_app, ebb_system;
