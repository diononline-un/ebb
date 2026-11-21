-- E1-P4: spaces, per-user settings and access, product events. RLS on every table (ENABLE + FORCE).
--
-- Policies name their role (TO ebb_app). SECURITY DEFINER helpers in schema app run as ebb_owner;
-- because FORCE applies to the owner too, space_member carries one explicit owner policy so that
-- app.is_member() can read memberships without recursing into its own policy.

CREATE TABLE space (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '' CHECK (char_length(name) <= 80),
  kind text NOT NULL CHECK (kind IN ('personal', 'shared')),
  owner_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX space_one_personal_per_owner ON space (owner_id) WHERE kind = 'personal';

CREATE TABLE space_member (
  space_id uuid NOT NULL REFERENCES space (id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (space_id, user_id)
);
CREATE INDEX space_member_user ON space_member (user_id);

CREATE TABLE space_invite (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES space (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  email text,
  created_by text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by text REFERENCES "user" (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_settings (
  user_id text PRIMARY KEY REFERENCES "user" (id) ON DELETE CASCADE,
  locale text NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'es', 'fr', 'de', 'ja', 'zh-CN')),
  timezone text NOT NULL DEFAULT 'UTC',
  day_start_minute int NOT NULL DEFAULT 240 CHECK (day_start_minute BETWEEN 0 AND 720),
  last_day_started date,
  morning_reminder time,
  weekly_reset_dow int NOT NULL DEFAULT 0 CHECK (weekly_reset_dow BETWEEN 0 AND 6),
  weekly_reset_time time NOT NULL DEFAULT '18:00',
  errands_dow int CHECK (errands_dow BETWEEN 0 AND 6),
  quiet_start time NOT NULL DEFAULT '21:00',
  quiet_end time NOT NULL DEFAULT '07:00',
  must_warn_at int NOT NULL DEFAULT 4 CHECK (must_warn_at BETWEEN 3 AND 5),
  timer_default_min int NOT NULL DEFAULT 25 CHECK (timer_default_min BETWEEN 5 AND 180),
  notify jsonb NOT NULL DEFAULT
    '{"morning": true, "habits": true, "weeklyReset": true, "errands": true, "timer": true, "trial": true}',
  onboarding_step int NOT NULL DEFAULT 0 CHECK (onboarding_step BETWEEN 0 AND 9),
  onboarding_done_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Written only by the system role (bootstrap, billing, retention). Users may read their own row.
CREATE TABLE user_access (
  user_id text PRIMARY KEY REFERENCES "user" (id) ON DELETE CASCADE,
  trial_ends_at timestamptz,
  deletion_warned_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE product_event (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (name ~ '^[a-z][a-z0-9_.]{1,63}$'),
  props jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_event_name_time ON product_event (name, created_at);

-- Helpers ------------------------------------------------------------------------------------

CREATE FUNCTION app.is_member(p_space uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$ SELECT EXISTS (SELECT 1 FROM public.space_member WHERE space_id = p_space AND user_id = app.uid()) $$;

CREATE FUNCTION app.is_owner(p_space uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$ SELECT EXISTS (
    SELECT 1 FROM public.space_member WHERE space_id = p_space AND user_id = app.uid() AND role = 'owner'
  ) $$;

REVOKE ALL ON FUNCTION app.is_member(uuid), app.is_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_member(uuid), app.is_owner(uuid) TO ebb_app, ebb_system;

-- RLS ----------------------------------------------------------------------------------------

ALTER TABLE space ENABLE ROW LEVEL SECURITY;
ALTER TABLE space FORCE ROW LEVEL SECURITY;
ALTER TABLE space_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE space_member FORCE ROW LEVEL SECURITY;
ALTER TABLE space_invite ENABLE ROW LEVEL SECURITY;
ALTER TABLE space_invite FORCE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE user_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_access FORCE ROW LEVEL SECURITY;
ALTER TABLE product_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_event FORCE ROW LEVEL SECURITY;

-- space: members read; the owner renames (column grant below) and deletes shared spaces.
-- Creating shared spaces goes through a SECURITY DEFINER function in E7-P1 (it must add the
-- owner membership in the same step), so ebb_app has no INSERT policy here.
CREATE POLICY space_read ON space FOR SELECT TO ebb_app USING (app.is_member(id));
CREATE POLICY space_rename ON space FOR UPDATE TO ebb_app
  USING (owner_id = app.uid()) WITH CHECK (owner_id = app.uid());
CREATE POLICY space_delete ON space FOR DELETE TO ebb_app USING (owner_id = app.uid() AND kind = 'shared');
REVOKE INSERT, UPDATE ON space FROM ebb_app;
GRANT UPDATE (name) ON space TO ebb_app;

-- space_member: members see who else is in their spaces. Joining and leaving come with E7.
CREATE POLICY member_read ON space_member FOR SELECT TO ebb_app
  USING (user_id = app.uid() OR app.is_member(space_id));
CREATE POLICY member_read_by_definer ON space_member FOR SELECT TO ebb_owner USING (true);
REVOKE INSERT, UPDATE, DELETE ON space_member FROM ebb_app;

-- space_invite: no access for ebb_app until E7-P1 defines invitations.
REVOKE ALL ON space_invite FROM ebb_app;

CREATE POLICY settings_own ON user_settings FOR SELECT TO ebb_app USING (user_id = app.uid());
CREATE POLICY settings_update_own ON user_settings FOR UPDATE TO ebb_app
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());
REVOKE INSERT, DELETE ON user_settings FROM ebb_app;

CREATE POLICY access_own ON user_access FOR SELECT TO ebb_app USING (user_id = app.uid());
REVOKE INSERT, UPDATE, DELETE ON user_access FROM ebb_app;

CREATE POLICY event_read_own ON product_event FOR SELECT TO ebb_app USING (user_id = app.uid());
CREATE POLICY event_insert_own ON product_event FOR INSERT TO ebb_app WITH CHECK (user_id = app.uid());
REVOKE UPDATE, DELETE ON product_event FROM ebb_app;
