-- Agenda & réservations (module "agenda") : réglages par business, rendez-vous,
-- et durée d'un service. Purement additif : deux nouvelles tables et une colonne
-- nullable sur products.

BEGIN;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS duration_minutes integer;

CREATE TABLE IF NOT EXISTS agenda_settings (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  text NOT NULL,
  business_id              uuid,
  opening_hours            jsonb NOT NULL DEFAULT '[]',
  slot_minutes             integer NOT NULL DEFAULT 30,
  default_duration_minutes integer NOT NULL DEFAULT 60,
  resources                text[] NOT NULL DEFAULT '{}',
  capacity                 integer NOT NULL DEFAULT 1,
  reminder_hours           integer NOT NULL DEFAULT 24,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agenda_settings_user_id_business_id_key
  ON agenda_settings (user_id, business_id);

CREATE TABLE IF NOT EXISTS appointments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          text NOT NULL,
  business_id      uuid,
  customer_name    text NOT NULL,
  customer_phone   text,
  contact_id       uuid,
  product_id       uuid,
  service_name     text,
  resource         text,
  start_at         timestamptz NOT NULL,
  end_at           timestamptz NOT NULL,
  status           text NOT NULL DEFAULT 'confirmed',
  source           text NOT NULL DEFAULT 'manual',
  notes            text,
  reminder_sent_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS appointments_business_id_start_at_idx ON appointments (business_id, start_at);
CREATE INDEX IF NOT EXISTS appointments_user_id_start_at_idx ON appointments (user_id, start_at);

COMMIT;
