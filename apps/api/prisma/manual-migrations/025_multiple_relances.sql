-- Permet plusieurs relances pour une même commande (jusqu'à 3 par client, puis suppression).
-- Retire la contrainte « une seule relance par commande » et garde un index simple.
-- Aucune donnée n'est modifiée.

BEGIN;

ALTER TABLE wa_followups DROP CONSTRAINT IF EXISTS wa_followups_order_id_type_key;
DROP INDEX IF EXISTS wa_followups_order_id_type_key;
CREATE INDEX IF NOT EXISTS wa_followups_order_id_type_idx ON wa_followups(order_id, type);

COMMIT;
