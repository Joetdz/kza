-- Rattrapage : réassigne au business par défaut toute ligne WhatsApp restée sans
-- business_id. Idempotent — relançable autant de fois que nécessaire.
--
-- Utile après la 002 si l'API tournait encore avec l'ancien code au moment de la
-- migration : ce process continue d'insérer des lignes sans business_id jusqu'à
-- son redémarrage. À rejouer UNE FOIS l'API redémarrée.

BEGIN;

UPDATE wa_baileys_keys k SET business_id = COALESCE(
  (SELECT b.id FROM businesses b WHERE b.user_id = k.user_id AND b.is_default = true ORDER BY b.created_at ASC LIMIT 1),
  (SELECT b.id FROM businesses b WHERE b.user_id = k.user_id ORDER BY b.created_at ASC LIMIT 1)
) WHERE k.business_id IS NULL;

UPDATE wa_contacts c SET business_id = COALESCE(
  (SELECT b.id FROM businesses b WHERE b.user_id = c.user_id AND b.is_default = true ORDER BY b.created_at ASC LIMIT 1),
  (SELECT b.id FROM businesses b WHERE b.user_id = c.user_id ORDER BY b.created_at ASC LIMIT 1)
) WHERE c.business_id IS NULL;

UPDATE wa_messages m SET business_id = COALESCE(
  (SELECT b.id FROM businesses b WHERE b.user_id = m.user_id AND b.is_default = true ORDER BY b.created_at ASC LIMIT 1),
  (SELECT b.id FROM businesses b WHERE b.user_id = m.user_id ORDER BY b.created_at ASC LIMIT 1)
) WHERE m.business_id IS NULL;

UPDATE wa_sessions s SET business_id = COALESCE(
  (SELECT b.id FROM businesses b WHERE b.user_id = s.user_id AND b.is_default = true ORDER BY b.created_at ASC LIMIT 1),
  (SELECT b.id FROM businesses b WHERE b.user_id = s.user_id ORDER BY b.created_at ASC LIMIT 1)
) WHERE s.business_id IS NULL;

UPDATE wa_tags t SET business_id = COALESCE(
  (SELECT b.id FROM businesses b WHERE b.user_id = t.user_id AND b.is_default = true ORDER BY b.created_at ASC LIMIT 1),
  (SELECT b.id FROM businesses b WHERE b.user_id = t.user_id ORDER BY b.created_at ASC LIMIT 1)
) WHERE t.business_id IS NULL;

UPDATE wa_ai_configs a SET business_id = COALESCE(
  (SELECT b.id FROM businesses b WHERE b.user_id = a.user_id AND b.is_default = true ORDER BY b.created_at ASC LIMIT 1),
  (SELECT b.id FROM businesses b WHERE b.user_id = a.user_id ORDER BY b.created_at ASC LIMIT 1)
) WHERE a.business_id IS NULL;

UPDATE wa_followup_configs f SET business_id = COALESCE(
  (SELECT b.id FROM businesses b WHERE b.user_id = f.user_id AND b.is_default = true ORDER BY b.created_at ASC LIMIT 1),
  (SELECT b.id FROM businesses b WHERE b.user_id = f.user_id ORDER BY b.created_at ASC LIMIT 1)
) WHERE f.business_id IS NULL;

UPDATE online_stores o SET business_id = COALESCE(
  (SELECT b.id FROM businesses b WHERE b.user_id = o.user_id AND b.is_default = true ORDER BY b.created_at ASC LIMIT 1),
  (SELECT b.id FROM businesses b WHERE b.user_id = o.user_id ORDER BY b.created_at ASC LIMIT 1)
) WHERE o.business_id IS NULL;

COMMIT;
