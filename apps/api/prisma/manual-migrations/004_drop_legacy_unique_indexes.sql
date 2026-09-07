-- Supprime les anciens index uniques trop larges laissés en place par la 001/002.
--
-- Pourquoi ils ont survécu : Prisma matérialise ses `@unique` / `@@unique` comme des
-- INDEX uniques, pas comme des CONTRAINTES. Les `DROP CONSTRAINT IF EXISTS` des
-- migrations précédentes n'ont donc rien supprimé — sans erreur, à cause du IF EXISTS.
--
-- Tant qu'ils existent, ils annulent tout le multi-business : ils interdisent
-- une 2e session WhatsApp, un 2e contact avec le même numéro, une 2e config IA, etc.
--
-- Supprimer un index ne touche à aucune donnée.

BEGIN;

DROP INDEX IF EXISTS wa_sessions_user_id_key;                  -- (user_id)
DROP INDEX IF EXISTS wa_baileys_keys_user_id_key_type_key_id_key; -- (user_id, key_type, key_id)
DROP INDEX IF EXISTS wa_contacts_user_id_phone_key;            -- (user_id, phone)
DROP INDEX IF EXISTS wa_messages_user_id_wa_id_key;            -- (user_id, wa_id)
DROP INDEX IF EXISTS wa_tags_user_id_name_key;                 -- (user_id, name)
DROP INDEX IF EXISTS wa_ai_configs_user_id_key;                -- (user_id)
DROP INDEX IF EXISTS wa_followup_configs_user_id_key;          -- (user_id)
DROP INDEX IF EXISTS online_stores_user_id_key;                -- (user_id)

COMMIT;
