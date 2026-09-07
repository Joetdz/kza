-- WhatsApp : un numéro (et donc une connexion) par business, au lieu d'un par compte.
-- NON DESTRUCTIF — ajoute des colonnes, rattache l'existant au business par défaut,
-- puis remplace les contraintes d'unicité trop larges.
--
-- Effet sur l'existant : la connexion WhatsApp actuelle reste valide et devient
-- celle du business par défaut. Les autres business démarrent non appairés
-- (QR à scanner) — c'est le comportement attendu.

BEGIN;

-- ── 1. wa_sessions ───────────────────────────────────────────────────────────
UPDATE wa_sessions s SET business_id = COALESCE(
  (SELECT b.id FROM businesses b WHERE b.user_id = s.user_id AND b.is_default = true ORDER BY b.created_at ASC LIMIT 1),
  (SELECT b.id FROM businesses b WHERE b.user_id = s.user_id ORDER BY b.created_at ASC LIMIT 1)
) WHERE s.business_id IS NULL;

ALTER TABLE wa_sessions DROP CONSTRAINT IF EXISTS wa_sessions_user_id_key;
ALTER TABLE wa_sessions DROP CONSTRAINT IF EXISTS wa_sessions_user_id_business_id_key;
ALTER TABLE wa_sessions
  ADD CONSTRAINT wa_sessions_user_id_business_id_key UNIQUE (user_id, business_id);

-- ── 2. wa_baileys_keys (clés de chiffrement Signal — une par connexion) ──────
ALTER TABLE wa_baileys_keys ADD COLUMN IF NOT EXISTS business_id uuid;

UPDATE wa_baileys_keys k SET business_id = COALESCE(
  (SELECT b.id FROM businesses b WHERE b.user_id = k.user_id AND b.is_default = true ORDER BY b.created_at ASC LIMIT 1),
  (SELECT b.id FROM businesses b WHERE b.user_id = k.user_id ORDER BY b.created_at ASC LIMIT 1)
) WHERE k.business_id IS NULL;

ALTER TABLE wa_baileys_keys DROP CONSTRAINT IF EXISTS wa_baileys_keys_user_id_key_type_key_id_key;
ALTER TABLE wa_baileys_keys DROP CONSTRAINT IF EXISTS wa_baileys_keys_user_id_business_id_key_type_key_id_key;
ALTER TABLE wa_baileys_keys
  ADD CONSTRAINT wa_baileys_keys_user_id_business_id_key_type_key_id_key
  UNIQUE (user_id, business_id, key_type, key_id);
CREATE INDEX IF NOT EXISTS wa_baileys_keys_business_id_idx ON wa_baileys_keys (business_id);

-- ── 3. wa_contacts ───────────────────────────────────────────────────────────
UPDATE wa_contacts c SET business_id = COALESCE(
  (SELECT b.id FROM businesses b WHERE b.user_id = c.user_id AND b.is_default = true ORDER BY b.created_at ASC LIMIT 1),
  (SELECT b.id FROM businesses b WHERE b.user_id = c.user_id ORDER BY b.created_at ASC LIMIT 1)
) WHERE c.business_id IS NULL;

ALTER TABLE wa_contacts DROP CONSTRAINT IF EXISTS wa_contacts_user_id_phone_key;
ALTER TABLE wa_contacts DROP CONSTRAINT IF EXISTS wa_contacts_user_id_business_id_phone_key;
ALTER TABLE wa_contacts
  ADD CONSTRAINT wa_contacts_user_id_business_id_phone_key
  UNIQUE (user_id, business_id, phone);

-- ── 4. wa_messages ───────────────────────────────────────────────────────────
UPDATE wa_messages m SET business_id = COALESCE(
  (SELECT b.id FROM businesses b WHERE b.user_id = m.user_id AND b.is_default = true ORDER BY b.created_at ASC LIMIT 1),
  (SELECT b.id FROM businesses b WHERE b.user_id = m.user_id ORDER BY b.created_at ASC LIMIT 1)
) WHERE m.business_id IS NULL;

ALTER TABLE wa_messages DROP CONSTRAINT IF EXISTS wa_messages_user_id_wa_id_key;
ALTER TABLE wa_messages DROP CONSTRAINT IF EXISTS wa_messages_user_id_business_id_wa_id_key;
ALTER TABLE wa_messages
  ADD CONSTRAINT wa_messages_user_id_business_id_wa_id_key
  UNIQUE (user_id, business_id, wa_id);

-- ── 5. wa_tags ───────────────────────────────────────────────────────────────
UPDATE wa_tags t SET business_id = COALESCE(
  (SELECT b.id FROM businesses b WHERE b.user_id = t.user_id AND b.is_default = true ORDER BY b.created_at ASC LIMIT 1),
  (SELECT b.id FROM businesses b WHERE b.user_id = t.user_id ORDER BY b.created_at ASC LIMIT 1)
) WHERE t.business_id IS NULL;

ALTER TABLE wa_tags DROP CONSTRAINT IF EXISTS wa_tags_user_id_name_key;
ALTER TABLE wa_tags DROP CONSTRAINT IF EXISTS wa_tags_user_id_business_id_name_key;
ALTER TABLE wa_tags
  ADD CONSTRAINT wa_tags_user_id_business_id_name_key
  UNIQUE (user_id, business_id, name);

-- ── 6. wa_ai_configs ─────────────────────────────────────────────────────────
UPDATE wa_ai_configs a SET business_id = COALESCE(
  (SELECT b.id FROM businesses b WHERE b.user_id = a.user_id AND b.is_default = true ORDER BY b.created_at ASC LIMIT 1),
  (SELECT b.id FROM businesses b WHERE b.user_id = a.user_id ORDER BY b.created_at ASC LIMIT 1)
) WHERE a.business_id IS NULL;

ALTER TABLE wa_ai_configs DROP CONSTRAINT IF EXISTS wa_ai_configs_user_id_key;
ALTER TABLE wa_ai_configs DROP CONSTRAINT IF EXISTS wa_ai_configs_user_id_business_id_key;
ALTER TABLE wa_ai_configs
  ADD CONSTRAINT wa_ai_configs_user_id_business_id_key UNIQUE (user_id, business_id);
CREATE INDEX IF NOT EXISTS wa_ai_configs_business_id_idx ON wa_ai_configs (business_id);

-- ── 7. wa_followup_configs ───────────────────────────────────────────────────
ALTER TABLE wa_followup_configs ADD COLUMN IF NOT EXISTS business_id uuid;

UPDATE wa_followup_configs f SET business_id = COALESCE(
  (SELECT b.id FROM businesses b WHERE b.user_id = f.user_id AND b.is_default = true ORDER BY b.created_at ASC LIMIT 1),
  (SELECT b.id FROM businesses b WHERE b.user_id = f.user_id ORDER BY b.created_at ASC LIMIT 1)
) WHERE f.business_id IS NULL;

ALTER TABLE wa_followup_configs DROP CONSTRAINT IF EXISTS wa_followup_configs_user_id_key;
ALTER TABLE wa_followup_configs DROP CONSTRAINT IF EXISTS wa_followup_configs_user_id_business_id_key;
ALTER TABLE wa_followup_configs
  ADD CONSTRAINT wa_followup_configs_user_id_business_id_key
  UNIQUE (user_id, business_id);
CREATE INDEX IF NOT EXISTS wa_followup_configs_business_id_idx ON wa_followup_configs (business_id);

COMMIT;
