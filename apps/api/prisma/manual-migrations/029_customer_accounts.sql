-- Comptes clients des boutiques en ligne : un compte par numéro WhatsApp, vérifié par code.
-- Nouvelles tables + une colonne facultative sur store_orders (vide pour l'existant).
-- Aucune donnée existante n'est modifiée.

BEGIN;

CREATE TABLE IF NOT EXISTS customers (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Numéro réduit à une forme comparable (voir common/phone.ts) : unique par client.
  phone_key            TEXT NOT NULL UNIQUE,
  phone                TEXT NOT NULL,
  name                 TEXT NOT NULL,
  password_hash        TEXT NOT NULL,
  -- Identifiant utilisé pour les likes et abonnements, repris d'un appareil à l'autre.
  visitor_id           UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  preferred_categories TEXT[] NOT NULL DEFAULT '{}',
  failed_logins        INTEGER NOT NULL DEFAULT 0,
  locked_until         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Codes envoyés par WhatsApp (inscription, mot de passe oublié). Seule l'empreinte est gardée.
CREATE TABLE IF NOT EXISTS customer_otps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_key   TEXT NOT NULL,
  purpose     TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_otps_phone_key_idx ON customer_otps(phone_key, created_at);

-- Sessions : seule l'empreinte du jeton est gardée ; un changement de mot de passe les ferme toutes.
CREATE TABLE IF NOT EXISTS customer_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_sessions_customer_id_idx ON customer_sessions(customer_id);

CREATE TABLE IF NOT EXISTS customer_addresses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label       TEXT NOT NULL DEFAULT '',
  city        TEXT NOT NULL,
  commune     TEXT NOT NULL DEFAULT '',
  avenue      TEXT NOT NULL DEFAULT '',
  reference   TEXT NOT NULL DEFAULT '',
  is_default  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_addresses_customer_id_idx ON customer_addresses(customer_id);

-- La commande passée par un client connecté ; les anciennes se retrouvent par le numéro.
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS store_orders_customer_id_idx ON store_orders(customer_id);

COMMIT;
