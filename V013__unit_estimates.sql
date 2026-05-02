-- V013: Estimated market value per unit
-- Values are fetched from Rentcast AVM and cached here.
-- Board admins can refresh any unit on demand.

ALTER TABLE units
  ADD COLUMN zestimate      NUMERIC(12,2),
  ADD COLUMN zestimate_low  NUMERIC(12,2),
  ADD COLUMN zestimate_high NUMERIC(12,2),
  ADD COLUMN zestimate_at   TIMESTAMPTZ;
