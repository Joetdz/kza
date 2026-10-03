-- Budget prévisionnel (onglet Objectifs). Nouvelles tables uniquement — aucune donnée
-- existante touchée.

CREATE TABLE IF NOT EXISTS budget_forecasts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            text NOT NULL,
  business_id        uuid,
  start_month        text NOT NULL DEFAULT '',
  monthly_growth_pct double precision NOT NULL DEFAULT 10,
  horizon_months     integer NOT NULL DEFAULT 12,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, business_id)
);

CREATE TABLE IF NOT EXISTS budget_forecast_products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id uuid NOT NULL REFERENCES budget_forecasts(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity    double precision NOT NULL DEFAULT 0,
  UNIQUE (forecast_id, product_id)
);

CREATE TABLE IF NOT EXISTS budget_forecast_expenses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_id uuid NOT NULL REFERENCES budget_forecasts(id) ON DELETE CASCADE,
  category    text NOT NULL,
  description text NOT NULL DEFAULT '',
  amount      double precision NOT NULL
);

CREATE INDEX IF NOT EXISTS budget_forecast_products_forecast_id_idx ON budget_forecast_products(forecast_id);
CREATE INDEX IF NOT EXISTS budget_forecast_expenses_forecast_id_idx ON budget_forecast_expenses(forecast_id);
