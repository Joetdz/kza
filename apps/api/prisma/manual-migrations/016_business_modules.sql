-- Modules activables par business (stock, boutique, WhatsApp, livraison…).
-- Purement additif : une colonne avec valeur par défaut. Une liste vide signifie
-- « business créé avant les modules » et garde tous les modules existants — aucun
-- business existant ne change.

BEGIN;

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS modules text[] NOT NULL DEFAULT '{}';

COMMIT;
