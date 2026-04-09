-- ============================================================
-- KZA E-Commerce — Migration Supabase
-- Copiez ce script dans : Supabase > SQL Editor > New query
-- ============================================================

-- Extension UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── PRODUITS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  sku              TEXT        NOT NULL UNIQUE,
  category         TEXT        NOT NULL DEFAULT '',
  quantity         INTEGER     NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  alert_threshold  INTEGER     NOT NULL DEFAULT 5,
  supplier         TEXT        NOT NULL DEFAULT '',
  acquisition_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  entry_date       DATE        NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mise à jour auto du champ updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── MOUVEMENTS DE STOCK ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_movements (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL CHECK (type IN ('in', 'out')),
  quantity    INTEGER     NOT NULL CHECK (quantity > 0),
  reason      TEXT        NOT NULL DEFAULT '',
  date        DATE        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movements_product_id ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_movements_date ON stock_movements(date);

-- ─── VENTES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel    TEXT        NOT NULL CHECK (channel IN ('WhatsApp','Meta Ads','TikTok','Instagram','Boutique','Autre')),
  date       DATE        NOT NULL,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
CREATE INDEX IF NOT EXISTS idx_sales_channel ON sales(channel);

-- ─── LIGNES DE VENTE ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sale_items (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id    UUID        NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID        REFERENCES products(id) ON DELETE SET NULL,
  quantity   INTEGER     NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0)
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);

-- ─── DÉPENSES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category    TEXT        NOT NULL CHECK (category IN ('pub','transport','stock','other')),
  product_id  UUID        REFERENCES products(id) ON DELETE SET NULL,
  channel     TEXT,
  amount      NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  description TEXT        NOT NULL DEFAULT '',
  date        DATE        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_product_id ON expenses(product_id);

-- ─── OBJECTIFS DE VENTE ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_goals (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT        NOT NULL,  -- 'all' ou UUID produit
  daily      NUMERIC(12,2) NOT NULL DEFAULT 0,
  weekly     NUMERIC(12,2) NOT NULL DEFAULT 0,
  monthly    NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── ROW LEVEL SECURITY (optionnel — désactivé par défaut) ───
-- Activez RLS si vous ajoutez de l'authentification Supabase Auth.
-- ALTER TABLE products ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE sales_goals ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

-- ─── VÉRIFICATION ────────────────────────────────────────────
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
