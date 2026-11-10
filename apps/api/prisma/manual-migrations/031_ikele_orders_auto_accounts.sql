-- Commandes Ikele et comptes clients créés à la commande.
-- source : d'où vient la commande en ligne ('ikele' pour l'app Ikele, NULL pour la
--   boutique Kzion), pour le badge de la Logistique.
-- password_hash facultatif : un compte créé automatiquement à la première commande n'a
--   pas encore de mot de passe ; le client en choisit un depuis son espace.
-- phone_verified : le numéro a été confirmé par un code WhatsApp. Seul un compte vérifié
--   retrouve les commandes passées avec ce numéro sans compte. Les comptes existants ont
--   tous été créés avec un code : ils sont vérifiés.
-- Aucune donnée existante n'est supprimée.

BEGIN;

ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE customers ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE customers ALTER COLUMN phone_verified SET DEFAULT false;

COMMIT;
