-- Type et coût sur chaque mouvement de stock, et réglage du stock négatif par business.
-- Les anciens mouvements sont classés d'après leur motif ; un motif saisi librement reste
-- « other ». Leur coût reste vide : il n'a jamais été enregistré.
-- Stock négatif interdit par défaut, y compris pour les business existants.

BEGIN;

ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'other';
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS unit_cost double precision;
-- Quantité comptée lors d'un inventaire : point de départ du recalcul du stock.
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS counted_quantity double precision;

UPDATE stock_movements SET kind = CASE
  WHEN reason = 'Stock initial' THEN 'initial'
  WHEN reason IN ('Vente', 'Vente confirmée') OR reason LIKE 'Commande #%' THEN 'sale'
  WHEN reason LIKE 'Retour — %' THEN 'return'
  WHEN reason = 'Ajustement manuel' THEN 'inventory'
  ELSE 'other'
END
WHERE kind = 'other';

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS allow_negative_stock boolean NOT NULL DEFAULT false;

COMMIT;
