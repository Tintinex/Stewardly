-- V012: Package management system
-- Tracks packages received at the front desk for unit owners.

CREATE TABLE packages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  hoa_id          UUID        NOT NULL REFERENCES hoas(id) ON DELETE CASCADE,
  unit_id         UUID        NOT NULL REFERENCES units(id),
  owner_id        UUID        REFERENCES owners(id),
  carrier         TEXT        NOT NULL DEFAULT 'Other',
  tracking_number TEXT,
  description     TEXT,
  recipient_name  TEXT,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  logged_by       UUID        REFERENCES owners(id),
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'picked_up', 'returned')),
  picked_up_at    TIMESTAMPTZ,
  picked_up_by    UUID        REFERENCES owners(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_packages_hoa_id   ON packages(hoa_id);
CREATE INDEX idx_packages_unit_id  ON packages(unit_id);
CREATE INDEX idx_packages_status   ON packages(hoa_id, status);
CREATE INDEX idx_packages_owner_id ON packages(owner_id);
