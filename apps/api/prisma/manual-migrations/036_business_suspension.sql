-- Suspension d'un business par l'admin (modération) : tant que suspended_at est rempli,
-- ses membres ne peuvent plus y travailler et sa boutique est hors ligne. Rien n'est
-- effacé ; l'admin peut le réactiver. suspended_reason : le motif, montré au business.
-- Ajout de colonnes vides uniquement : aucune donnée existante n'est modifiée.

BEGIN;

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

COMMIT;
