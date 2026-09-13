-- Apprentissage de l'IA par business : pause après réponse manuelle, mode silencieux
-- à la connexion, import de contenu (site web / réseaux sociaux) dans la base de
-- connaissance. Purement additif — colonnes nullable ou avec valeur par défaut,
-- aucune table existante n'est modifiée en profondeur.

BEGIN;

ALTER TABLE wa_sessions
  ADD COLUMN IF NOT EXISTS linked_at timestamptz;

ALTER TABLE wa_contacts
  ADD COLUMN IF NOT EXISTS ai_paused_until timestamptz;

ALTER TABLE wa_ai_configs
  ADD COLUMN IF NOT EXISTS silent_onboarding_hours integer NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS human_pause_hours integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS website_url text,
  ADD COLUMN IF NOT EXISTS facebook_url text,
  ADD COLUMN IF NOT EXISTS instagram_url text;

COMMIT;
