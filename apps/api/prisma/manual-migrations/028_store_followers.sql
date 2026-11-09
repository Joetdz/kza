-- Abonnés des boutiques en ligne (bouton « S'abonner » dans le feed des Reels).
-- Une ligne par visiteur abonné : il ne compte qu'une fois et peut se désabonner.
-- Nouvelle table uniquement : aucune donnée existante n'est modifiée.

BEGIN;

CREATE TABLE IF NOT EXISTS store_followers (
  store_id   UUID NOT NULL REFERENCES online_stores(id) ON DELETE CASCADE,
  visitor_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, visitor_id)
);

COMMIT;
