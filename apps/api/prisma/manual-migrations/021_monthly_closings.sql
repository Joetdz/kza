-- Clôture mensuelle des objectifs et du budget prévisionnel.
-- Purement additif : une nouvelle table. Chaque mois terminé y est figé (plan + réalisé) ;
-- un déclencheur interdit toute modification d'une clôture (« clôturé, c'est clôturé »).

BEGIN;

CREATE TABLE IF NOT EXISTS monthly_closings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  month       text NOT NULL,              -- "YYYY-MM", mois civil de l'entreprise
  closed_at   timestamptz NOT NULL DEFAULT now(),
  data        jsonb NOT NULL,             -- plan, réalisé, noms et prix au moment de la clôture
  CONSTRAINT monthly_closings_month_format CHECK (month ~ '^\d{4}-\d{2}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS monthly_closings_business_month_key
  ON monthly_closings (business_id, month);

-- A closed month never changes. Deleting stays possible so that deleting a business
-- can still remove its history.
CREATE OR REPLACE FUNCTION monthly_closings_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Mois clôturé : modification interdite (%)', OLD.month;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS monthly_closings_no_update ON monthly_closings;
CREATE TRIGGER monthly_closings_no_update
  BEFORE UPDATE ON monthly_closings
  FOR EACH ROW EXECUTE FUNCTION monthly_closings_immutable();

COMMIT;
