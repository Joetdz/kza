-- Coût d'achat unitaire figé sur chaque ligne de vente, pour que les marges passées ne
-- bougent plus quand le coût moyen du produit change.
-- Les ventes existantes reçoivent le coût actuel du produit, seule valeur connue.
-- Sans produit lié (supprimé ou ligne libre), le coût reste vide.

BEGIN;

ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS unit_cost double precision;

UPDATE sale_items si
SET unit_cost = p.acquisition_cost
FROM products p
WHERE si.product_id = p.id AND si.unit_cost IS NULL;

COMMIT;
