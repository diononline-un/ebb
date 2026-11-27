-- E8-P6: seats. Paddle keeps the truth in `custom_data.seatUserIds`; this table only holds the wish
-- until the next webhook confirms it (docs/specs/E08-billing.md). The payer reads it, ebb_app never
-- writes it: the request path records the wish through app.request_seat after Paddle answered 2xx,
-- so no system-role transaction is needed there.

CREATE TABLE seat_request (
  subscription_id uuid NOT NULL REFERENCES subscription (id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('cover', 'release')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subscription_id, user_id)
);

ALTER TABLE seat_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE seat_request FORCE ROW LEVEL SECURITY;

-- Only the paying person reads the open wishes of their own subscription.
CREATE POLICY seat_request_read ON seat_request FOR SELECT TO ebb_app
  USING (EXISTS (
    SELECT 1 FROM subscription s
     WHERE s.id = seat_request.subscription_id AND s.payer_user_id = app.uid()
  ));
REVOKE INSERT, UPDATE, DELETE ON seat_request FROM ebb_app;

-- A covered person needs status and period end of the subscription they sit on; without this row
-- hasAccess() cannot answer 'seat' (E8-P1, E8-P6 acceptance). The subquery sees only own seat rows.
CREATE POLICY subscription_read_seat ON subscription FOR SELECT TO ebb_app
  USING (EXISTS (
    SELECT 1 FROM subscription_seat seat
     WHERE seat.subscription_id = subscription.id AND seat.user_id = app.uid()
  ));

-- FORCE RLS binds ebb_owner too, and the SECURITY DEFINER functions below run as ebb_owner.
CREATE POLICY seat_request_write_definer ON seat_request FOR ALL TO ebb_owner
  USING (true) WITH CHECK (true);
CREATE POLICY subscription_read_definer ON subscription FOR SELECT TO ebb_owner
  USING (payer_user_id = app.uid());
CREATE POLICY seat_read_definer ON subscription_seat FOR SELECT TO ebb_owner USING (true);

-- The payer stores the wish after Paddle accepted the change. The function repeats the payer check
-- itself, because ebb_app cannot write the table directly.
CREATE FUNCTION app.request_seat(p_subscription uuid, p_user text, p_action text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF p_action NOT IN ('cover', 'release') THEN
    RAISE EXCEPTION 'invalid_action' USING ERRCODE = 'check_violation';
  END IF;
  IF app.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM subscription WHERE id = p_subscription AND payer_user_id = app.uid()
  ) THEN
    RAISE EXCEPTION 'not_your_subscription' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO seat_request (subscription_id, user_id, action)
  VALUES (p_subscription, p_user, p_action)
  ON CONFLICT (subscription_id, user_id)
    DO UPDATE SET action = excluded.action, requested_at = now();
END
$$;

-- Who the subscription covers, with names: "user" belongs to ebb_auth, so only a definer function
-- may join it. The payer check keeps other people's seats out of reach.
CREATE FUNCTION app.covered_seats(p_subscription uuid)
  RETURNS TABLE (user_id text, name text)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM subscription WHERE id = p_subscription AND payer_user_id = app.uid()
  ) THEN
    RAISE EXCEPTION 'not_your_subscription' USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
    SELECT seat.user_id, u.name::text
      FROM subscription_seat seat
      JOIN "user" u ON u.id = seat.user_id
     WHERE seat.subscription_id = p_subscription
     ORDER BY seat.created_at;
END
$$;

-- A person sits on at most one subscription. ebb_app cannot see other people's seats, so the payer
-- asks here; only people from the caller's shared spaces get a true answer.
CREATE FUNCTION app.is_seated(p_user text) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public
  AS $$
    SELECT EXISTS (
      SELECT 1
        FROM public.subscription_seat seat
       WHERE seat.user_id = p_user
         AND EXISTS (
           SELECT 1
             FROM public.space s
             JOIN public.space_member mine ON mine.space_id = s.id AND mine.user_id = app.uid()
             JOIN public.space_member other ON other.space_id = s.id AND other.user_id = p_user
            WHERE s.kind = 'shared'))
  $$;

REVOKE ALL ON FUNCTION app.request_seat(uuid, text, text), app.covered_seats(uuid), app.is_seated(text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.request_seat(uuid, text, text), app.covered_seats(uuid), app.is_seated(text)
  TO ebb_app;
