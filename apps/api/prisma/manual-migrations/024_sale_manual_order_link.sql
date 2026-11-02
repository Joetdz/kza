-- Relie chaque vente issue de la logistique à sa commande, pour qu'un retour annule la bonne vente.
-- Les ventes existantes sont retrouvées grâce à leur note (« Logistique #0012 — … »).
-- Les ventes sans correspondance restent sans lien ; rien d'autre n'est modifié.

BEGIN;

ALTER TABLE sales ADD COLUMN IF NOT EXISTS manual_order_id uuid
  REFERENCES manual_orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sales_manual_order_id_idx ON sales(manual_order_id);

UPDATE sales s
SET manual_order_id = o.id
FROM manual_orders o
WHERE s.manual_order_id IS NULL
  AND s.channel = 'logistics'
  AND s.user_id = o.user_id
  AND s.business_id::text = o.business_id
  AND o.status = 'delivered'
  AND s.note LIKE 'Logistique #' || lpad(o.order_number::text, greatest(4, length(o.order_number::text)), '0') || ' —%';

COMMIT;
