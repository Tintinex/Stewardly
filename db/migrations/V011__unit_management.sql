-- V011 — Unit Management Enhancements
-- Adds ownership_percent to units for percentage-based assessment distribution

ALTER TABLE units
  ADD COLUMN IF NOT EXISTS ownership_percent NUMERIC(6,3)
    CHECK (ownership_percent IS NULL OR (ownership_percent >= 0 AND ownership_percent <= 100));

COMMENT ON COLUMN units.ownership_percent IS
  'Fractional ownership share (0–100). Used for percentage-based assessment distribution.
   All units should sum to 100 but this is not enforced at DB level to allow partial setup.';
