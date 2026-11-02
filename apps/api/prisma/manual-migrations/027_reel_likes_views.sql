-- Likes et vues des Reels de la boutique publique.
-- Ajoute deux compteurs (à 0) et une table qui retient qui a liké, pour qu'un visiteur
-- ne compte qu'une fois et puisse retirer son like. Aucune donnée existante n'est modifiée.

BEGIN;

ALTER TABLE product_media
  ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS product_media_likes (
  media_id   UUID NOT NULL REFERENCES product_media(id) ON DELETE CASCADE,
  visitor_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (media_id, visitor_id)
);

COMMIT;
