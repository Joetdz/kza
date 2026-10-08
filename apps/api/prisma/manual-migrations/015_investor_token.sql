ALTER TABLE investors ADD COLUMN IF NOT EXISTS token uuid DEFAULT gen_random_uuid();

ALTER TABLE investors ALTER COLUMN token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS investors_token_key ON investors(token);
