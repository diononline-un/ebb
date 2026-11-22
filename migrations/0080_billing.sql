-- E8-P2/P3: the webhook store, the subscriptions and their seats. Rules: docs/specs/E08-billing.md.
-- Only the system role writes here (the webhook and the job); a person reads their own subscription.

CREATE TABLE billing_event (
  id bigserial PRIMARY KEY,
  event_id text NOT NULL UNIQUE,
  type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  failed_at timestamptz,
  failure text
);
CREATE INDEX billing_event_open ON billing_event (received_at) WHERE processed_at IS NULL;

CREATE TABLE subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payer_user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  paddle_subscription_id text NOT NULL UNIQUE,
  paddle_customer_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'paused')),
  base_price_id text NOT NULL DEFAULT '',
  extra_seats int NOT NULL DEFAULT 0 CHECK (extra_seats BETWEEN 0 AND 5),
  current_period_end timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX subscription_payer ON subscription (payer_user_id);

CREATE TABLE subscription_seat (
  subscription_id uuid NOT NULL REFERENCES subscription (id) ON DELETE CASCADE,
  user_id text NOT NULL UNIQUE REFERENCES "user" (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subscription_id, user_id)
);

ALTER TABLE billing_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_event FORCE ROW LEVEL SECURITY;
ALTER TABLE subscription ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription FORCE ROW LEVEL SECURITY;
ALTER TABLE subscription_seat ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_seat FORCE ROW LEVEL SECURITY;

-- The event store is nobody's business in the request path.
REVOKE ALL ON billing_event FROM ebb_app;

-- A person reads their own subscription and sees which seats it carries (billing page, read-only UI).
CREATE POLICY subscription_read_own ON subscription FOR SELECT TO ebb_app
  USING (payer_user_id = app.uid());
CREATE POLICY seat_read_own ON subscription_seat FOR SELECT TO ebb_app USING (user_id = app.uid());
REVOKE INSERT, UPDATE, DELETE ON subscription FROM ebb_app;
REVOKE INSERT, UPDATE, DELETE ON subscription_seat FROM ebb_app;
