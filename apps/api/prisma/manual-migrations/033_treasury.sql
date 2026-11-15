-- Trésorerie : les comptes du business (caisse, mobile money, banque) et chaque entrée ou
-- sortie d'argent. Solde d'un compte = solde de départ + somme de ses mouvements.
-- amount est signé : positif = entrée, négatif = sortie.
-- Un mouvement peut venir d'un versement partenaire confirmé ou d'une dépense payée depuis
-- le compte : il disparaît avec eux (ON DELETE CASCADE), un seul mouvement par origine.
-- expenses.treasury_account_id : « payé depuis quel compte », facultatif.
-- Création uniquement : aucune donnée existante n'est modifiée.

BEGIN;

CREATE TABLE IF NOT EXISTS treasury_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  business_id     UUID,
  name            TEXT NOT NULL,
  kind            TEXT NOT NULL DEFAULT 'cash',
  currency        TEXT NOT NULL DEFAULT 'USD',
  opening_balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  opening_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  archived        BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS treasury_accounts_business_idx ON treasury_accounts (business_id);
CREATE INDEX IF NOT EXISTS treasury_accounts_user_idx ON treasury_accounts (user_id);

CREATE TABLE IF NOT EXISTS treasury_movements (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            TEXT NOT NULL,
  business_id        UUID,
  account_id         UUID NOT NULL REFERENCES treasury_accounts(id) ON DELETE CASCADE,
  date               DATE NOT NULL,
  amount             NUMERIC(14, 2) NOT NULL,
  kind               TEXT NOT NULL DEFAULT 'manual',
  label              TEXT NOT NULL DEFAULT '',
  partner_payment_id UUID UNIQUE REFERENCES partner_payments(id) ON DELETE CASCADE,
  expense_id         UUID UNIQUE REFERENCES expenses(id) ON DELETE CASCADE,
  transfer_id        UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS treasury_movements_account_idx ON treasury_movements (account_id, date);
CREATE INDEX IF NOT EXISTS treasury_movements_business_idx ON treasury_movements (business_id, date);

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS treasury_account_id UUID
  REFERENCES treasury_accounts(id) ON DELETE SET NULL;

COMMIT;
