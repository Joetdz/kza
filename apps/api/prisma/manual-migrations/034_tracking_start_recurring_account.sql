-- Suivi des versements à partir d'une date, et compte qui paie les dépenses récurrentes.
-- delivery_partners.tracking_start : à partir de cette date, les commandes livrées et les
--   versements comptent ; avant, tout est considéré réglé. NULL : tout l'historique compte
--   (la règle d'avant). Fixée par le business depuis Kzion (« Démarrer le suivi »), jamais
--   ici : la colonne arrive vide, aucun solde ne change.
-- recurring_expenses.treasury_account_id : chaque dépense générée sort de ce compte.
-- Ajout de colonnes uniquement : aucune donnée existante n'est modifiée.

BEGIN;

ALTER TABLE delivery_partners ADD COLUMN IF NOT EXISTS tracking_start DATE;
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS treasury_account_id UUID
  REFERENCES treasury_accounts(id) ON DELETE SET NULL;

COMMIT;
