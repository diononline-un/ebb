-- E3-P1: focus sessions behind the timer (PRD F7). Energy and the ritual live in day_entry (0020).
-- The clock runs in the client; the server only keeps start, plan and end for the weekly numbers.

CREATE TABLE focus_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT app.uid() REFERENCES "user" (id) ON DELETE CASCADE,
  task_id uuid REFERENCES task (id) ON DELETE SET NULL,
  slot text CHECK (slot IN ('block1', 'block2', 'block3', 'block4')),
  planned_minutes int NOT NULL CHECK (planned_minutes BETWEEN 1 AND 180),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  CONSTRAINT focus_session_ends_after_start CHECK (ended_at IS NULL OR ended_at >= started_at)
);
-- One running timer per person; starting a new one ends the old one first (domain/focus/focus.ts).
CREATE UNIQUE INDEX focus_session_one_open ON focus_session (user_id) WHERE ended_at IS NULL;
CREATE INDEX focus_session_user_time ON focus_session (user_id, started_at);

ALTER TABLE focus_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE focus_session FORCE ROW LEVEL SECURITY;

CREATE POLICY focus_own ON focus_session FOR ALL TO ebb_app
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());
REVOKE DELETE ON focus_session FROM ebb_app;
