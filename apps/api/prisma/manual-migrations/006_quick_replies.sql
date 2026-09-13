-- Réponses rapides WhatsApp Business, recopiées depuis le téléphone.
-- Purement additif — une nouvelle table, aucune table existante modifiée.

BEGIN;

CREATE TABLE IF NOT EXISTS wa_quick_replies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text NOT NULL,
  business_id uuid,
  wa_id       text NOT NULL,
  shortcut    text NOT NULL,
  message     text NOT NULL,
  keywords    text[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wa_quick_replies_user_id_business_id_wa_id_key
  ON wa_quick_replies (user_id, business_id, wa_id);
CREATE INDEX IF NOT EXISTS wa_quick_replies_business_id_idx
  ON wa_quick_replies (business_id);

COMMIT;
