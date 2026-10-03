-- Entrepôt principal par défaut, un par business. Additive uniquement : nouvelle colonne
-- avec valeur par défaut, aucune donnée existante touchée. La création réelle des lignes
-- "entrepôt principal" pour chaque business se fait paresseusement côté application
-- (LogisticsService.ensureDefaultLocation), pas ici — pas besoin de backfill en SQL.

ALTER TABLE stock_locations
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;
