-- Ikele, la place de marché des boutiques Kzion.
-- ikele_listed : la boutique apparaît dans le feed global et l'annuaire d'Ikele (oui par
-- défaut, le marchand peut la retirer ; son lien reste accessible dans tous les cas).
-- thumbnail_url : miniature d'une vidéo, pour les grilles façon profil TikTok.
-- Ajout de colonnes uniquement : aucune donnée existante n'est modifiée.

BEGIN;

ALTER TABLE online_stores ADD COLUMN IF NOT EXISTS ikele_listed BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE product_media ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

COMMIT;
