-- V009: Enhance finances tables for full HOA financial management

-- ── Transactions enhancements ─────────────────────────────────────────────────
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS vendor      TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS notes       TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_manual   BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_transactions_hoa_type ON transactions(hoa_id, type);

-- ── Assessments enhancements ──────────────────────────────────────────────────
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS description  TEXT NOT NULL DEFAULT '';
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS notes        TEXT;

-- ── Budget line item enhancements ─────────────────────────────────────────────
-- Allow tracking which transactions map to each budget category automatically
CREATE INDEX IF NOT EXISTS idx_transactions_hoa_category_date
  ON transactions(hoa_id, category, date DESC);
