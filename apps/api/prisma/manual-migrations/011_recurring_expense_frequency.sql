-- Ajoute les échéances journalière/hebdo/annuelle aux dépenses récurrentes (jusqu'ici
-- mensuel uniquement). Table créée il y a quelques minutes, encore vide — retravaillée
-- directement plutôt que migrée avec rétrocompatibilité.

ALTER TABLE recurring_expenses
  ADD COLUMN IF NOT EXISTS frequency text NOT NULL DEFAULT 'monthly';

ALTER TABLE recurring_expenses
  ADD COLUMN IF NOT EXISTS day_of_week integer;

ALTER TABLE recurring_expenses
  ADD COLUMN IF NOT EXISTS month integer;

ALTER TABLE recurring_expenses
  ALTER COLUMN day_of_month DROP NOT NULL;

ALTER TABLE recurring_expenses
  ALTER COLUMN day_of_month DROP DEFAULT;

ALTER TABLE recurring_expenses
  RENAME COLUMN last_generated_month TO last_generated_period;
