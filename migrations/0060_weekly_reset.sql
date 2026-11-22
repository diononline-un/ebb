-- E6-P1: the weekly reset and its answer per week. Rules: docs/specs/E06-weekly-reset.md.
-- A person keeps one row per week; the row also remembers the step the reset stands on.

CREATE TABLE weekly_reset (
  user_id text NOT NULL DEFAULT app.uid() REFERENCES "user" (id) ON DELETE CASCADE,
  week_start date NOT NULL,
  went_well text NOT NULL DEFAULT '' CHECK (char_length(went_well) <= 2000),
  went_badly text NOT NULL DEFAULT '' CHECK (char_length(went_badly) <= 2000),
  change text NOT NULL DEFAULT '' CHECK (char_length(change) <= 2000),
  step int NOT NULL DEFAULT 0 CHECK (step BETWEEN 0 AND 4),
  completed_at timestamptz,
  PRIMARY KEY (user_id, week_start)
);

ALTER TABLE weekly_reset ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_reset FORCE ROW LEVEL SECURITY;

CREATE POLICY weekly_reset_own ON weekly_reset FOR ALL TO ebb_app
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());
