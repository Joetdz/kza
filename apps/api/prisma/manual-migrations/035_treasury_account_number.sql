-- Numéro d'un compte de trésorerie : numéro de compte bancaire (ou IBAN) pour une banque,
-- numéro de téléphone pour un compte mobile money, facultatif pour une caisse physique.
-- Ajout d'une colonne uniquement : aucune donnée existante n'est modifiée.

BEGIN;

ALTER TABLE treasury_accounts ADD COLUMN IF NOT EXISTS account_number TEXT;

COMMIT;
