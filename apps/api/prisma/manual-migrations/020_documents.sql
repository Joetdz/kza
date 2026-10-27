-- Devis & factures (module "invoices") et prix dégressifs par quantité.
-- Purement additif : une nouvelle table et une colonne nullable sur products.

BEGIN;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS price_tiers jsonb;

CREATE TABLE IF NOT EXISTS commercial_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          text NOT NULL,
  business_id      uuid,
  type             text NOT NULL,
  number           text NOT NULL,
  year             integer NOT NULL,
  seq              integer NOT NULL,
  customer_name    text NOT NULL,
  customer_phone   text,
  customer_address text,
  items            jsonb NOT NULL DEFAULT '[]',
  discount         double precision NOT NULL DEFAULT 0,
  tax_rate         double precision NOT NULL DEFAULT 0,
  notes            text,
  status           text NOT NULL,
  issue_date       date NOT NULL,
  due_date         date,
  source_quote_id  uuid,
  sale_id          uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS commercial_documents_user_id_business_id_type_year_seq_key
  ON commercial_documents (user_id, business_id, type, year, seq);
CREATE INDEX IF NOT EXISTS commercial_documents_business_id_type_idx
  ON commercial_documents (business_id, type);

COMMIT;
