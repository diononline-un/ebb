-- E8-P8: the two trial mails ("ends in 2 days", "has ended"). Each mail goes out once per account,
-- so user_access carries one mark per mail. No new table and no policy change: only the system role
-- writes user_access (0003), which is where the job runs.
ALTER TABLE user_access
  ADD COLUMN trial_soon_mailed_at timestamptz,
  ADD COLUMN trial_end_mailed_at timestamptz;
