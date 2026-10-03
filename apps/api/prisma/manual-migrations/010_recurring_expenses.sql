-- Dépenses récurrentes (salaires, loyers, remboursements de créances...). Nouvelle table
-- uniquement — aucune donnée existante touchée.

CREATE TABLE IF NOT EXISTS recurring_expenses (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category             text NOT NULL,
  description          text NOT NULL DEFAULT '',
  amount               double precision NOT NULL,
  day_of_month         integer NOT NULL DEFAULT 1,
  start_date           date NOT NULL,
  end_date             date,
  active               boolean NOT NULL DEFAULT true,
  last_generated_month text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  user_id              text NOT NULL,
  business_id          uuid
);

CREATE INDEX IF NOT EXISTS recurring_expenses_user_id_idx ON recurring_expenses(user_id);
CREATE INDEX IF NOT EXISTS recurring_expenses_business_id_idx ON recurring_expenses(business_id);
