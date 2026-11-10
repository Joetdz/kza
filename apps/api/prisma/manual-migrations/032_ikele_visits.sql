-- Compteur de visiteurs d'Ikele.
-- ikele_visits : une ligne par visiteur et par jour (heure de Kinshasa) où il ouvre Ikele.
-- ikele_store_visits : une ligne par visiteur, boutique et jour où il voit cette boutique
--   (profil ou vidéos), pour les chiffres de chaque vendeur.
-- visitor_id : l'identifiant anonyme de l'appareil, déjà utilisé pour les likes et les
--   abonnements (celui du compte client une fois connecté). Ni nom ni numéro.
-- Création de tables uniquement : aucune donnée existante n'est modifiée.

BEGIN;

CREATE TABLE IF NOT EXISTS ikele_visits (
  day        DATE        NOT NULL,
  visitor_id UUID        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (day, visitor_id)
);
CREATE INDEX IF NOT EXISTS ikele_visits_visitor_idx ON ikele_visits (visitor_id, day);

CREATE TABLE IF NOT EXISTS ikele_store_visits (
  day        DATE        NOT NULL,
  store_id   UUID        NOT NULL REFERENCES online_stores(id) ON DELETE CASCADE,
  visitor_id UUID        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, day, visitor_id)
);

COMMIT;
