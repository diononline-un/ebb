-- E4-P1: goals, habits and their daily logs. Rules: docs/specs/E04-ziele-habits-onboarding.md.
-- Goals and habits are always personal (user_id = app.uid()); shared work runs through projects (E5).

CREATE TABLE goal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT app.uid() REFERENCES "user" (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  why text NOT NULL DEFAULT '' CHECK (char_length(why) <= 280),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'done')),
  position int NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX goal_owner ON goal (user_id, position, created_at);

CREATE TABLE habit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT app.uid() REFERENCES "user" (id) ON DELETE CASCADE,
  goal_id uuid REFERENCES goal (id) ON DELETE SET NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  cadence text NOT NULL DEFAULT 'daily' CHECK (cadence IN ('daily', 'weekly_count')),
  weekly_target int CHECK (weekly_target BETWEEN 1 AND 7),
  weekdays int[],
  reminder_time time,
  position int NOT NULL DEFAULT 0 CHECK (position >= 0),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- A habit that counts a weekly target needs one; a daily habit carries no target.
  CONSTRAINT habit_weekly_target CHECK (cadence <> 'weekly_count' OR weekly_target IS NOT NULL),
  CONSTRAINT habit_weekdays CHECK (
    weekdays IS NULL OR (weekdays <@ '{0,1,2,3,4,5,6}'::int[] AND cardinality(weekdays) BETWEEN 1 AND 7)
  )
);
CREATE INDEX habit_owner ON habit (user_id, position, created_at);
CREATE INDEX habit_goal ON habit (goal_id);

CREATE TABLE habit_log (
  habit_id uuid NOT NULL REFERENCES habit (id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (habit_id, date)
);
CREATE INDEX habit_log_user ON habit_log (user_id, date);

-- The client never names the owner of a log: it belongs to whoever owns the habit. Reading the habit
-- inside the trigger also keeps a foreign habit id from writing a row at all (RLS hides it, and the
-- NOT NULL then refuses the insert).
CREATE FUNCTION app.habit_log_owner() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  SELECT user_id INTO NEW.user_id FROM habit WHERE id = NEW.habit_id;
  RETURN NEW;
END
$$;

CREATE TRIGGER habit_log_owner BEFORE INSERT ON habit_log
  FOR EACH ROW EXECUTE FUNCTION app.habit_log_owner();

ALTER TABLE goal ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal FORCE ROW LEVEL SECURITY;
ALTER TABLE habit ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit FORCE ROW LEVEL SECURITY;
ALTER TABLE habit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_log FORCE ROW LEVEL SECURITY;

-- goal: the owner reads, writes and deletes. The five-active limit lives in the domain (E4-P2), so
-- the answer can carry a code the UI translates.
CREATE POLICY goal_own ON goal FOR ALL TO ebb_app
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());

-- habit: archived instead of deleted, so DELETE stays with the owner role (cleanup scripts only).
CREATE POLICY habit_own ON habit FOR SELECT TO ebb_app USING (user_id = app.uid());
CREATE POLICY habit_insert_own ON habit FOR INSERT TO ebb_app WITH CHECK (user_id = app.uid());
CREATE POLICY habit_update_own ON habit FOR UPDATE TO ebb_app
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());
REVOKE DELETE ON habit FROM ebb_app;

-- habit_log: ticking a day off and taking it back are the same user's business.
CREATE POLICY habit_log_own ON habit_log FOR SELECT TO ebb_app USING (user_id = app.uid());
CREATE POLICY habit_log_insert_own ON habit_log FOR INSERT TO ebb_app WITH CHECK (user_id = app.uid());
CREATE POLICY habit_log_delete_own ON habit_log FOR DELETE TO ebb_app USING (user_id = app.uid());
REVOKE UPDATE ON habit_log FROM ebb_app;
