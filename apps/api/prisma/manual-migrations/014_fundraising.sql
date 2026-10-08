CREATE TABLE IF NOT EXISTS fundraising_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  business_id uuid,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  target_amount double precision NOT NULL,
  entry_ticket double precision NOT NULL,
  max_investors integer,
  repayment_due_date text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fundraising_campaigns_user_id_idx ON fundraising_campaigns(user_id);

CREATE INDEX IF NOT EXISTS fundraising_campaigns_business_id_idx ON fundraising_campaigns(business_id);

CREATE TABLE IF NOT EXISTS investors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name text NOT NULL,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fundraising_investments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES fundraising_campaigns(id) ON DELETE CASCADE,
  investor_id uuid NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  amount double precision NOT NULL,
  repayment_amount double precision NOT NULL,
  repayment_due_date text,
  repaid_amount double precision NOT NULL DEFAULT 0,
  repaid_at text,
  status text NOT NULL DEFAULT 'pending',
  invested_at text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fundraising_investments_campaign_id_idx ON fundraising_investments(campaign_id);

CREATE INDEX IF NOT EXISTS fundraising_investments_investor_id_idx ON fundraising_investments(investor_id);
