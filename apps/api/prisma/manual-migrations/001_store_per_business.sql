-- Boutique en ligne : une boutique par business (au lieu d'une par compte)
-- NON DESTRUCTIF — ajoute une colonne, rattache l'existant, remplace la contrainte.
-- À exécuter dans le SQL Editor de Supabase APRÈS avoir pris un backup.

BEGIN;

-- 1. Nouvelle colonne (nullable → aucune ligne existante n'est rejetée)
ALTER TABLE online_stores
  ADD COLUMN IF NOT EXISTS business_id uuid;

-- 2. Rattache chaque boutique existante au business par défaut de son propriétaire.
--    Si l'utilisateur n'a pas de business marqué par défaut, on prend le plus ancien.
UPDATE online_stores s
SET business_id = COALESCE(
  (SELECT b.id FROM businesses b
    WHERE b.user_id = s.user_id AND b.is_default = true
    ORDER BY b.created_at ASC LIMIT 1),
  (SELECT b.id FROM businesses b
    WHERE b.user_id = s.user_id
    ORDER BY b.created_at ASC LIMIT 1)
)
WHERE s.business_id IS NULL;

-- 3. Retire l'ancienne contrainte « une seule boutique par compte »
ALTER TABLE online_stores
  DROP CONSTRAINT IF EXISTS online_stores_user_id_key;

-- 4. Nouvelle contrainte : une boutique par (compte, business)
ALTER TABLE online_stores
  ADD CONSTRAINT online_stores_user_id_business_id_key
  UNIQUE (user_id, business_id);

-- 5. Index de lecture
CREATE INDEX IF NOT EXISTS online_stores_business_id_idx
  ON online_stores (business_id);

COMMIT;

-- Vérification : chaque boutique doit avoir un business_id renseigné
-- SELECT id, slug, user_id, business_id FROM online_stores;
