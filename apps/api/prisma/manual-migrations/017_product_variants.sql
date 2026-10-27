-- Variantes de produit (taille, couleur, contenance…). Chaque variante reste un
-- produit à part entière (stock, prix, SKU) regroupé sous un nom de modèle.
-- Purement additif : deux colonnes nullables, aucun produit existant ne change.

BEGIN;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS variant_group text,
  ADD COLUMN IF NOT EXISTS variant_label text;

CREATE INDEX IF NOT EXISTS products_business_id_variant_group_idx
  ON products (business_id, variant_group);

COMMIT;
