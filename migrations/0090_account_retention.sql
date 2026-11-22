-- E9-P5: deleting an account and the retention job that removes inactive ones.
-- Rules: docs/specs/E09-betrieb.md, PRD F15/F17.

-- The job deletes an account by deleting its auth row; every app table cascades from there
-- ("user" is the parent of space, task, subscription, ...). Until now the system role could only
-- read who a user is (0002), so this path had no right to remove one.
GRANT DELETE ON "user" TO ebb_system;

-- "12 months without a login" needs a login timestamp. The newest session row is the last time the
-- account was opened; user_access.last_seen_at only carries the day access was last checked, which
-- nothing refreshes yet. Read-only, two columns, no session token or IP leaves the auth tables.
GRANT SELECT ("userId", "createdAt") ON "session" TO ebb_system;

-- The retention mails come 30 and 7 days before removal. deletion_warned_at (0003) is the first
-- mark; the final reminder needs its own, or the job would send it every day for a week.
ALTER TABLE user_access ADD COLUMN deletion_final_warned_at timestamptz;
