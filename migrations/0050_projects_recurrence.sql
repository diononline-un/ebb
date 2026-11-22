-- E5-P1: projects, recurring tasks and one level of subtasks. Rules: docs/specs/E05-projekte.md.
-- Names and columns follow the glossary in docs/architektur.md.

CREATE TABLE project (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES space (id) ON DELETE CASCADE,
  goal_id uuid REFERENCES goal (id) ON DELETE SET NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'done')),
  start_date date,
  deadline date,
  created_by text NOT NULL DEFAULT app.uid() REFERENCES "user" (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_dates CHECK (start_date IS NULL OR deadline IS NULL OR deadline >= start_date)
);
CREATE INDEX project_space ON project (space_id, status);
CREATE INDEX project_goal ON project (goal_id);

CREATE TABLE recurrence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES space (id) ON DELETE CASCADE,
  created_by text NOT NULL DEFAULT app.uid() REFERENCES "user" (id) ON DELETE CASCADE,
  assignee_id text REFERENCES "user" (id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 5000),
  project_id uuid REFERENCES project (id) ON DELETE SET NULL,
  -- { freq: 'daily' | 'weekdays' | 'weekly' | 'every_n_days' | 'monthly', interval?, weekdays?, monthDay? }
  rule jsonb NOT NULL CHECK (jsonb_typeof(rule) = 'object' AND rule ? 'freq'),
  starts_on date NOT NULL,
  last_generated_on date,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recurrence_space ON recurrence (space_id, active);
CREATE INDEX recurrence_assignee ON recurrence (assignee_id) WHERE active;

ALTER TABLE task
  ADD COLUMN project_id uuid REFERENCES project (id) ON DELETE SET NULL,
  ADD COLUMN parent_id uuid REFERENCES task (id) ON DELETE CASCADE,
  ADD COLUMN recurrence_id uuid REFERENCES recurrence (id) ON DELETE SET NULL;
-- One instance per rule and day, so a second run of the day start cannot double a task.
CREATE UNIQUE INDEX task_one_instance_per_day ON task (recurrence_id, do_date) WHERE recurrence_id IS NOT NULL;
CREATE INDEX task_project ON task (project_id);
CREATE INDEX task_parent ON task (parent_id) WHERE parent_id IS NOT NULL;

-- A project may only hang on a goal of the same person, and only in that person's personal space:
-- goals are personal (E4), shared spaces carry projects without one.
CREATE FUNCTION app.project_before_write() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_space_kind text;
  v_space_owner text;
  v_goal_owner text;
BEGIN
  IF NEW.goal_id IS NOT NULL THEN
    SELECT kind, owner_id INTO v_space_kind, v_space_owner FROM space WHERE id = NEW.space_id;
    SELECT user_id INTO v_goal_owner FROM goal WHERE id = NEW.goal_id;
    IF v_space_kind IS DISTINCT FROM 'personal' OR v_space_owner IS DISTINCT FROM v_goal_owner THEN
      RAISE EXCEPTION 'goal_not_personal' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER project_before_write BEFORE INSERT OR UPDATE ON project
  FOR EACH ROW EXECUTE FUNCTION app.project_before_write();

-- Subtasks are one level deep and stay in the space of their parent.
CREATE FUNCTION app.task_parent_guard() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_parent_space uuid;
  v_parent_parent uuid;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT space_id, parent_id INTO v_parent_space, v_parent_parent FROM task WHERE id = NEW.parent_id;
  IF v_parent_space IS DISTINCT FROM NEW.space_id THEN
    RAISE EXCEPTION 'subtask_other_space' USING ERRCODE = 'check_violation';
  END IF;
  IF v_parent_parent IS NOT NULL THEN
    RAISE EXCEPTION 'subtask_too_deep' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER task_parent_guard BEFORE INSERT OR UPDATE OF parent_id ON task
  FOR EACH ROW EXECUTE FUNCTION app.task_parent_guard();

ALTER TABLE project ENABLE ROW LEVEL SECURITY;
ALTER TABLE project FORCE ROW LEVEL SECURITY;
ALTER TABLE recurrence ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurrence FORCE ROW LEVEL SECURITY;

-- project: every member of the space reads and writes; deleting stays with the creator or the owner.
CREATE POLICY project_read ON project FOR SELECT TO ebb_app USING (app.is_member(space_id));
CREATE POLICY project_insert ON project FOR INSERT TO ebb_app
  WITH CHECK (app.is_member(space_id) AND created_by = app.uid());
CREATE POLICY project_update ON project FOR UPDATE TO ebb_app
  USING (app.is_member(space_id)) WITH CHECK (app.is_member(space_id));
CREATE POLICY project_delete ON project FOR DELETE TO ebb_app
  USING (app.is_member(space_id) AND (created_by = app.uid() OR app.is_owner(space_id)));

-- recurrence: the same, because a rule is shared work like its instances.
CREATE POLICY recurrence_read ON recurrence FOR SELECT TO ebb_app USING (app.is_member(space_id));
CREATE POLICY recurrence_insert ON recurrence FOR INSERT TO ebb_app
  WITH CHECK (app.is_member(space_id) AND created_by = app.uid());
CREATE POLICY recurrence_update ON recurrence FOR UPDATE TO ebb_app
  USING (app.is_member(space_id)) WITH CHECK (app.is_member(space_id));
CREATE POLICY recurrence_delete ON recurrence FOR DELETE TO ebb_app
  USING (app.is_member(space_id) AND (created_by = app.uid() OR app.is_owner(space_id)));
