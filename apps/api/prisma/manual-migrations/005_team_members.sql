-- Équipe : le propriétaire d'un business peut y inviter des membres via un lien.
-- Purement additif — deux nouvelles tables, aucune table existante modifiée.

BEGIN;

CREATE TABLE IF NOT EXISTS business_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id      text NOT NULL,
  email        text,
  display_name text,
  role         text NOT NULL DEFAULT 'operator',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS business_members_business_id_user_id_key
  ON business_members (business_id, user_id);
CREATE INDEX IF NOT EXISTS business_members_user_id_idx     ON business_members (user_id);
CREATE INDEX IF NOT EXISTS business_members_business_id_idx ON business_members (business_id);

CREATE TABLE IF NOT EXISTS business_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  token       text NOT NULL,
  role        text NOT NULL DEFAULT 'operator',
  label       text,
  created_by  text NOT NULL,
  accepted_by text,
  accepted_at timestamptz,
  revoked_at  timestamptz,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS business_invites_token_key ON business_invites (token);
CREATE INDEX IF NOT EXISTS business_invites_business_id_idx  ON business_invites (business_id);

COMMIT;
