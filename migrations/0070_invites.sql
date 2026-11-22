-- E7-P1: shared spaces, invitations and joining. Rules: docs/specs/E07-bereiche.md.
-- 0003 already carries the tables; this adds the two ways in, both SECURITY DEFINER because the
-- request role may never write a membership for itself.

CREATE FUNCTION app.create_shared_space(p_name text) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_space uuid;
BEGIN
  IF app.uid() IS NULL THEN
    RAISE EXCEPTION 'no_user';
  END IF;
  INSERT INTO space (name, kind, owner_id) VALUES (left(coalesce(p_name, ''), 80), 'shared', app.uid())
    RETURNING id INTO v_space;
  INSERT INTO space_member (space_id, user_id, role) VALUES (v_space, app.uid(), 'owner');
  RETURN v_space;
END
$$;

-- The token itself never reaches the database: the caller hashes it and only the hash is compared.
CREATE FUNCTION app.accept_invite(p_token_hash text) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
DECLARE
  v_invite space_invite;
BEGIN
  IF app.uid() IS NULL THEN
    RAISE EXCEPTION 'no_user';
  END IF;
  SELECT * INTO v_invite FROM space_invite
   WHERE token_hash = p_token_hash AND used_at IS NULL AND expires_at > now()
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_invalid' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO space_member (space_id, user_id, role) VALUES (v_invite.space_id, app.uid(), 'member')
    ON CONFLICT (space_id, user_id) DO NOTHING;
  UPDATE space_invite SET used_at = now(), used_by = app.uid() WHERE id = v_invite.id;
  RETURN v_invite.space_id;
END
$$;

REVOKE ALL ON FUNCTION app.create_shared_space(text), app.accept_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.create_shared_space(text), app.accept_invite(text) TO ebb_app, ebb_system;

-- Invitations: the owner writes them, the creator reads and revokes them. Everyone else sees nothing.
GRANT SELECT, INSERT, DELETE ON space_invite TO ebb_app;

CREATE POLICY invite_read_creator ON space_invite FOR SELECT TO ebb_app USING (created_by = app.uid());
CREATE POLICY invite_insert_owner ON space_invite FOR INSERT TO ebb_app
  WITH CHECK (created_by = app.uid() AND app.is_owner(space_id));
CREATE POLICY invite_delete_creator ON space_invite FOR DELETE TO ebb_app USING (created_by = app.uid());
