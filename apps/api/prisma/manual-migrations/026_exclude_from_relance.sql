-- Permet d'exclure une commande des relances (bouton « Relance / Relance off » de la Logistique).
-- Ajoute une colonne, désactivée par défaut : aucune commande existante ne change de comportement.

BEGIN;

ALTER TABLE manual_orders ADD COLUMN IF NOT EXISTS exclude_from_relance boolean NOT NULL DEFAULT false;

COMMIT;
