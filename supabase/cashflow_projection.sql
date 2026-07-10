-- Cashflow Projection enhancements: period-level adjustments, split
-- collections, and notes. Additive only — does not alter the invoices,
-- customers, or receipts tables. Safe to run any time; the app already
-- degrades gracefully (local-state-only) if these tables don't exist yet.
--
-- Not persisted here, by design: variance and collection % are pure
-- functions of adjusted_amount and the computed outstanding total, so
-- storing them would just be redundant, staleness-prone data.

CREATE TABLE IF NOT EXISTS cashflow_period_adjustments (
  period_key text NOT NULL,
  period_type text NOT NULL CHECK (period_type IN ('week', 'month')),
  adjusted_amount numeric NOT NULL CHECK (adjusted_amount >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (period_key, period_type)
);

CREATE TABLE IF NOT EXISTS cashflow_period_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_key text NOT NULL,
  period_type text NOT NULL CHECK (period_type IN ('week', 'month')),
  amount numeric NOT NULL CHECK (amount >= 0),
  expected_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_key, period_type, expected_date)
);

CREATE INDEX IF NOT EXISTS idx_cashflow_period_splits_period
  ON cashflow_period_splits (period_key, period_type);

CREATE TABLE IF NOT EXISTS cashflow_period_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_key text NOT NULL,
  period_type text NOT NULL CHECK (period_type IN ('week', 'month')),
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cashflow_period_notes_period
  ON cashflow_period_notes (period_key, period_type);
