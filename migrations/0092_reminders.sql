-- E9-P2: the reminder job's ledger. One row per reminder a person has received; the primary key is
-- what keeps two runs (or two instances) from sending the same reminder twice.
--
-- Only the job writes and reads this table. The request role gets nothing: the settings page (E9-P3)
-- reads user_settings, and no API has to know what was sent when.

CREATE TABLE reminder_sent (
  user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('morning', 'habit', 'weeklyReset', 'errands', 'timer', 'trial')),
  ref text NOT NULL DEFAULT '',
  local_date date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, ref, local_date)
);

-- The cleanup deletes everything older than 30 days once a day.
CREATE INDEX reminder_sent_sent_at ON reminder_sent (sent_at);

ALTER TABLE reminder_sent ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_sent FORCE ROW LEVEL SECURITY;

-- No policy names ebb_app: the table has no request-path reader. The system role bypasses RLS.
REVOKE ALL ON reminder_sent FROM ebb_app;
