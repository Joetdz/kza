-- Créances (module "credit") : ventes à crédit, paiements partiels et échéancier.
-- Purement additif : deux colonnes nullables sur sales et deux nouvelles tables.
-- Aucune vente existante ne change (le statut « credit » n'est utilisé que par les
-- nouvelles ventes à crédit).

BEGIN;

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz;

CREATE TABLE IF NOT EXISTS sale_payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id     uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  amount      double precision NOT NULL,
  date        date NOT NULL,
  method      text NOT NULL DEFAULT 'cash',
  note        text,
  user_id     text NOT NULL,
  business_id uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sale_payments_sale_id_idx ON sale_payments (sale_id);
CREATE INDEX IF NOT EXISTS sale_payments_business_id_idx ON sale_payments (business_id);

CREATE TABLE IF NOT EXISTS sale_installments (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id  uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  due_date date NOT NULL,
  amount   double precision NOT NULL
);
CREATE INDEX IF NOT EXISTS sale_installments_sale_id_idx ON sale_installments (sale_id);

COMMIT;
