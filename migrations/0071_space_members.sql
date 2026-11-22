-- E7-P1/P2: the request role may never write a membership for itself, so the ways in and out of a
-- shared space are SECURITY DEFINER functions. FORCE RLS binds the owner too (0003), so each table
-- the functions touch gets one explicit policy for the owner role. The request role keeps its
-- revokes from 0003: these policies change nothing it can reach directly.

CREATE POLICY space_insert_definer ON space FOR INSERT TO ebb_owner
  WITH CHECK (owner_id = app.uid());
-- RETURNING (and every read inside a definer function) needs a SELECT policy as well.
CREATE POLICY space_select_definer ON space FOR SELECT TO ebb_owner
  USING (owner_id = app.uid() OR app.is_member(id));
CREATE POLICY invite_select_definer ON space_invite FOR SELECT TO ebb_owner USING (true);
CREATE POLICY member_insert_definer ON space_member FOR INSERT TO ebb_owner
  WITH CHECK (user_id = app.uid() OR app.is_owner(space_id));
CREATE POLICY member_delete_definer ON space_member FOR DELETE TO ebb_owner
  USING (user_id = app.uid() OR app.is_owner(space_id));
CREATE POLICY invite_update_definer ON space_invite FOR UPDATE TO ebb_owner
  USING (true) WITH CHECK (true);
CREATE POLICY task_update_definer ON task FOR UPDATE TO ebb_owner
  USING (app.is_member(space_id)) WITH CHECK (app.is_member(space_id));

-- A member walks away; their tasks in the space go back to "nobody" and lose the plan (PRD F13).
CREATE FUNCTION app.leave_space(p_space uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_kind text;
  v_role text;
BEGIN
  IF app.uid() IS NULL THEN
    RAISE EXCEPTION 'no_user';
  END IF;
  SELECT kind INTO v_kind FROM space WHERE id = p_space;
  SELECT role INTO v_role FROM space_member WHERE space_id = p_space AND user_id = app.uid();
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'not_a_member' USING ERRCODE = 'check_violation';
  END IF;
  IF v_kind = 'personal' THEN
    RAISE EXCEPTION 'personal_space' USING ERRCODE = 'check_violation';
  END IF;
  IF v_role = 'owner' THEN
    RAISE EXCEPTION 'owner_cannot_leave' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE task SET assignee_id = NULL, slot = 'inbox', must = false, anchor = false, do_date = NULL
   WHERE space_id = p_space AND assignee_id = app.uid();
  DELETE FROM space_member WHERE space_id = p_space AND user_id = app.uid();
END
$$;

-- The owner removes someone; the same reset applies to that person's tasks.
CREATE FUNCTION app.remove_member(p_space uuid, p_user text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_role text;
BEGIN
  IF NOT app.is_owner(p_space) THEN
    RAISE EXCEPTION 'owner_only' USING ERRCODE = 'check_violation';
  END IF;
  SELECT role INTO v_role FROM space_member WHERE space_id = p_space AND user_id = p_user;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'not_a_member' USING ERRCODE = 'check_violation';
  END IF;
  IF v_role = 'owner' THEN
    RAISE EXCEPTION 'owner_cannot_leave' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE task SET assignee_id = NULL, slot = 'inbox', must = false, anchor = false, do_date = NULL
   WHERE space_id = p_space AND assignee_id = p_user;
  DELETE FROM space_member WHERE space_id = p_space AND user_id = p_user;
END
$$;

REVOKE ALL ON FUNCTION app.leave_space(uuid), app.remove_member(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.leave_space(uuid), app.remove_member(uuid, text) TO ebb_app, ebb_system;

-- The member list needs names and mails, which live in the auth table that only ebb_auth may read.
-- The definer function checks the membership first, so only people in the space see who else is in.
CREATE FUNCTION app.space_members(p_space uuid)
  RETURNS TABLE (user_id text, email text, name text, role text, joined_at timestamptz)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF NOT app.is_member(p_space) THEN
    RAISE EXCEPTION 'not_a_member' USING ERRCODE = 'check_violation';
  END IF;
  RETURN QUERY
    SELECT m.user_id, u.email::text, u.name::text, m.role::text, m.joined_at
      FROM space_member m
      JOIN "user" u ON u.id = m.user_id
     WHERE m.space_id = p_space
     ORDER BY m.role, m.joined_at;
END
$$;

REVOKE ALL ON FUNCTION app.space_members(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.space_members(uuid) TO ebb_app, ebb_system;
